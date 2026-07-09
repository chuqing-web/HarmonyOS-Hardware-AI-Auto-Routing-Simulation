/**
 * 虚拟仪器控制面板 — Proteus 风格，示波器/逻辑仪/万用表/信号源/串口/电压表/电流表/功率表/频率计
 */
import { AppService } from '../services/AppService';
import {
  OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode,
  MathChannelOp, MultimeterMode, SignalWaveform, LogicDecodeProtocol,
  VoltmeterType, AmmeterType
} from 'common';
import { ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { OscilloscopeWaveCanvas } from './OscilloscopeWaveCanvas';
import { LogicAnalyzerWaveCanvas } from './LogicAnalyzerWaveCanvas';

interface SelectValueOption {
  value: string;
}

@Component
export struct InstrumentPanel {
  @Link statusMessage: string;
  @State subTab: number = 0;
  @State timebaseIdx: number = 2;
  @State voltageScaleIdx: number = 3;
  @State triggerLevel: number = 1.0;
  @State logicChannels: number = 8;
  @State threshold: number = 1500;
  @State mmReading: string = '----';
  @State mmMode: string = 'DCV';
  @State freq: string = '1kHz';
  @State uartHex: string = '55 AA';
  @State uartLog: string = '';
  @State waveTimeData: number[] = [];
  @State waveVoltageData: number[] = [];
  @State waveCh2Data: number[] = [];
  @State cursorAIdx: number = 100;
  @State cursorBIdx: number = 200;
  @State cursorMeasureText: string = '';
  @State decodedFramesText: string = '';
  @State logicChannelData: number[][] = [];
  @State logicSampleCount: number = 128;
  @State vmType: number = 0;
  @State vmReading: string = '--.--';
  @State vmRange: string = '20V';
  @State vmUnit: string = 'V DC';
  @State amType: number = 0;
  @State amReading: string = '--.--';
  @State amRange: string = '200mA';
  @State amUnit: string = 'mA DC';
  @State pmVoltage: string = '--';
  @State pmCurrent: string = '--';
  @State pmPower: string = '--';
  @State pmPF: string = '--';
  @State fcReading: string = '----';
  @State fcGateTime: number = 1.0;

  private appService: AppService = AppService.getInstance();
  private timebases: OscTimebase[] = [
    OscTimebase.NS_10, OscTimebase.US_1, OscTimebase.MS_1, OscTimebase.S_1, OscTimebase.S_10
  ];
  private timebaseLabels: string[] = ['10ns', '1us', '1ms', '1s', '10s'];
  private selTimebase: SelectValueOption[] = [
    { value: '10ns' }, { value: '1us' }, { value: '1ms' }, { value: '1s' }, { value: '10s' }
  ];
  private selVScale: SelectValueOption[] = [
    { value: '1mV' }, { value: '10mV' }, { value: '100mV' },
    { value: '1V' }, { value: '10V' }, { value: '100V' }
  ];
  private selLogicCh: SelectValueOption[] = [
    { value: '8' }, { value: '16' }, { value: '32' }
  ];
  private autoRefreshTimer: number = -1;

  aboutToAppear(): void {
    this.autoRefreshTimer = setInterval(() => {
      this.autoRefreshReadings();
    }, 500);
  }

  aboutToDisappear(): void {
    if (this.autoRefreshTimer >= 0) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = -1;
    }
  }

  /** Auto-refresh all instrument readings from simulation */
  autoRefreshReadings(): void {
    try {
      // Multimeter
      const mm = this.appService.instruments.measure();
      if (mm.success && mm.data !== undefined) {
        this.mmReading = mm.data.toFixed(3);
      }
      // Voltmeter
      const vr = this.appService.instruments.voltmeterMeasure();
      if (vr.success && vr.data !== undefined) {
        this.vmReading = vr.data.toFixed(3);
      }
      const vcfg = this.appService.instruments.getVoltmeterConfig();
      if (vcfg.success && vcfg.data !== undefined) {
        this.vmRange = `${vcfg.data.range}V`;
        this.vmUnit = vcfg.data.unit ?? 'V DC';
      }
      // Ammeter
      const ar = this.appService.instruments.ammeterMeasure();
      if (ar.success && ar.data !== undefined) {
        this.amReading = ar.data.toFixed(3);
      }
      const acfg = this.appService.instruments.getAmmeterConfig();
      if (acfg.success && acfg.data !== undefined) {
        this.amRange = `${acfg.data.range}mA`;
        this.amUnit = acfg.data.unit ?? 'mA DC';
      }
      // Oscilloscope
      const osc = this.appService.instruments.getOscilloscopeWave(0);
      if (osc.success && osc.data) {
        this.waveTimeData = osc.data.timeAxis.slice();
        this.waveVoltageData = osc.data.voltageAxis.slice();
      }
      const osc2 = this.appService.instruments.getOscilloscopeWave(1);
      if (osc2.success && osc2.data) {
        this.waveCh2Data = osc2.data.voltageAxis.slice();
      }
      // Power Meter
      const pm = this.appService.instruments.powerMeterMeasure();
      if (pm.success && pm.data) {
        this.pmVoltage = pm.data.voltage.toFixed(3);
        this.pmCurrent = (pm.data.current * 1000).toFixed(2);
        this.pmPower = (pm.data.power * 1000).toFixed(1);
        this.pmPF = pm.data.powerFactor.toFixed(2);
      }
      // Frequency Counter
      const fc = this.appService.instruments.freqCounterMeasure();
      if (fc.success && fc.data !== undefined) {
        if (fc.data >= 1000000) {
          this.fcReading = `${(fc.data / 1000000).toFixed(3)} MHz`;
        } else if (fc.data >= 1000) {
          this.fcReading = `${(fc.data / 1000).toFixed(1)} kHz`;
        } else {
          this.fcReading = `${fc.data.toFixed(0)} Hz`;
        }
      }
    } catch (_e) {
      // Best-effort auto-refresh
    }
  }

  build() {
    Column() {
      Tabs({ barPosition: BarPosition.Start, index: this.subTab }) {
        TabContent() { this.OscPanel() }.tabBar('示波器')
        TabContent() { this.LogicPanel() }.tabBar('逻辑仪')
        TabContent() { this.MmPanel() }.tabBar('万用表')
        TabContent() { this.SigGenPanel() }.tabBar('信号源')
        TabContent() { this.UartPanel() }.tabBar('串口')
        TabContent() { this.VoltmeterPanel() }.tabBar('电压表')
        TabContent() { this.AmmeterPanel() }.tabBar('电流表')
        TabContent() { this.PowerMeterPanel() }.tabBar('功率表')
        TabContent() { this.FreqCounterPanel() }.tabBar('频率计')
      }
      .barHeight(28)
      .barMode(BarMode.Scrollable)
      .onChange((idx: number) => { this.subTab = idx; })
      .layoutWeight(1)
    }
    .backgroundColor(ProteusColors.CANVAS_BG)
    .width('100%')
    .height('100%')
  }

  // ==================== Readout Display (shared) ====================
  @Builder
  ReadoutDisplay(label: string, value: string, unit: string) {
    Column() {
      Text(label)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontFamily('monospace')
      Text(value)
        .fontSize(36)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Bold)
        .fontFamily('monospace')
      if (unit.length > 0) {
        Text(unit)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .fontFamily('monospace')
          .margin({ top: 2 })
      }
    }
    .width('92%')
    .padding({ top: 10, bottom: 10 })
    .backgroundColor(ProteusColors.INPUT_READONLY_BG)
    .border({ width: 1, color: ProteusColors.DIVIDER })
    .alignItems(HorizontalAlign.Center)
  }

  @Builder
  PlaceholderDisplay(hint: string) {
    Column() {
      Text(hint)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_SECONDARY)
    }
    .width('100%')
    .height(80)
    .backgroundColor('#0a0a12')
    .justifyContent(FlexAlign.Center)
  }

  // ==================== Oscilloscope ====================
  @Builder
  OscPanel() {
    Scroll() {
      Column({ space: 6 }) {
        // Controls row
        Row({ space: 6 }) {
          Text('时基').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(28)
          Select(this.selTimebase)
            .selected(this.timebaseIdx).value(this.timebaseLabels[this.timebaseIdx])
            .font({ size: 10 }).fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .width(56).height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onSelect((idx: number) => {
              this.timebaseIdx = idx;
              this.appService.instruments.setTimebase(this.timebases[idx]);
            })
          Text('档位').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(28)
          Select(this.selVScale)
            .selected(this.voltageScaleIdx)
            .value(['1mV','10mV','100mV','1V','10V','100V'][this.voltageScaleIdx])
            .font({ size: 10 }).fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .width(56).height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onSelect((idx: number) => { this.voltageScaleIdx = idx; })
        }
        .width('100%').padding({ left: 8, right: 8, top: 6 })
        .justifyContent(FlexAlign.Start)

        // Action buttons
        Row({ space: 4 }) {
          ProteusClassicBtn({ label: 'AC', widthVal: 36,
            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } })
          ProteusClassicBtn({ label: 'DC', widthVal: 36,
            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } })
          Text(`触发:${this.triggerLevel.toFixed(1)}V`)
            .fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_LABEL).width(52)
          Slider({ value: this.triggerLevel, min: -5, max: 5, step: 0.1 })
            .width(50).height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onChange((v: number) => { this.triggerLevel = v; })
          ProteusClassicBtn({ label: '采样', widthVal: 40,
            onAction: () => { this.captureWave(); } })
          ProteusClassicBtn({ label: 'FFT', widthVal: 36,
            onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT, true); } })
        }
        .width('100%').padding({ left: 8, right: 8 })

        // Waveform display
        Column() {
          if (this.waveVoltageData.length > 0) {
            OscilloscopeWaveCanvas({
              timeData: this.waveTimeData,
              voltageData: this.waveVoltageData,
              channelLabel: 'CH1',
              vPerDiv: 1,
              triggerLevel: this.triggerLevel
            })
          } else {
            this.PlaceholderDisplay('点击"采样"获取波形')
          }
        }
        .width('100%').padding({ left: 4, right: 4 })

        // CH2
        if (this.waveCh2Data.length > 0) {
          Column() {
            OscilloscopeWaveCanvas({
              timeData: this.waveTimeData,
              voltageData: this.waveCh2Data,
              channelLabel: 'CH2',
              vPerDiv: 1,
              triggerLevel: this.triggerLevel
            })
          }
          .width('100%').padding({ left: 4, right: 4 })
        }

        // Cursors
        Column({ space: 2 }) {
          Row() {
            Text('A:').fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_LABEL).width(16)
            Slider({ value: this.cursorAIdx, min: 0, max: 1023, step: 1 })
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT)
              .onChange((v: number) => { this.cursorAIdx = v; this.updateCursorMeasure(); })
          }.width('100%')
          Row() {
            Text('B:').fontSize(ProteusFonts.STATUS).fontColor(ProteusColors.TEXT_LABEL).width(16)
            Slider({ value: this.cursorBIdx, min: 0, max: 1023, step: 1 })
              .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT)
              .onChange((v: number) => { this.cursorBIdx = v; this.updateCursorMeasure(); })
          }.width('100%')
          if (this.cursorMeasureText.length > 0) {
            Text(this.cursorMeasureText)
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.HOVER_PREVIEW)
              .maxLines(1)
              .padding({ top: 2 })
          }
        }
        .width('100%').padding({ left: 8, right: 8, bottom: 8 })
      }
      .width('100%')
    }
    .width('100%').height('100%')
  }

  private captureWave(): void {
    for (let ch = 0; ch < 4; ch++) {
      const snap = this.appService.instruments.getOscilloscopeWave(ch);
      if (snap.success && snap.data) {
        if (ch === 0) {
          this.waveTimeData = snap.data.timeAxis.slice();
          this.waveVoltageData = snap.data.voltageAxis.slice();
        } else if (ch === 1) {
          this.waveCh2Data = snap.data.voltageAxis.slice();
        }
      }
    }
  }

  // ==================== Logic Analyzer ====================
  @Builder
  LogicPanel() {
    Scroll() {
      Column({ space: 6 }) {
        Row({ space: 6 }) {
          Text('通道').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(28)
          Select(this.selLogicCh)
            .selected(0).font({ size: 10 }).fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .width(50).height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onSelect((idx: number) => {
              this.logicChannels = [8, 16, 32][idx];
              this.appService.instruments.setChannels(this.logicChannels);
            })
          Text('阈值').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(28)
          TextInput({ text: `${this.threshold}` })
            .fontSize(10).fontColor(ProteusColors.TEXT_PRIMARY)
            .width(60).height(ProteusDimens.PARAM_ROW_HEIGHT)
            .borderRadius(0).border({ width: 1, color: ProteusColors.INPUT_BORDER })
            .backgroundColor(ProteusColors.CANVAS_BG)
            .onChange((v: string) => {
              this.threshold = parseInt(v) || 1500;
              this.appService.instruments.setThreshold(this.threshold);
            })
        }
        .width('100%').padding({ left: 8, right: 8, top: 6 })

        Row({ space: 4 }) {
          ProteusClassicBtn({ label: 'UART', widthVal: 44,
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200); this.refreshDecodedFrames(); } })
          ProteusClassicBtn({ label: 'I2C', widthVal: 36,
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C); this.refreshDecodedFrames(); } })
          ProteusClassicBtn({ label: 'SPI', widthVal: 36,
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI); this.refreshDecodedFrames(); } })
          ProteusClassicBtn({ label: 'CAN', widthVal: 36,
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.CAN); } })
          ProteusClassicBtn({ label: '采样', widthVal: 40,
            onAction: () => { this.captureLogic(); } })
        }
        .width('100%').padding({ left: 8, right: 8 })

        Column() {
          if (this.logicChannelData.length > 0) {
            LogicAnalyzerWaveCanvas({
              channelData: this.logicChannelData,
              channelCount: this.logicChannels,
              sampleCount: this.logicSampleCount
            })
          } else {
            this.PlaceholderDisplay('点击"采样"获取逻辑波形')
          }
        }
        .width('100%').padding({ left: 4, right: 4 })

        if (this.decodedFramesText.length > 0) {
          Text(this.decodedFramesText)
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.HOVER_PREVIEW)
            .maxLines(6)
            .padding({ left: 8, right: 8, bottom: 8 })
        }
      }
      .width('100%')
    }
    .width('100%').height('100%')
  }

  private captureLogic(): void {
    const snap = this.appService.instruments.getLogicWaveData();
    if (snap.success && snap.data) {
      const channels: number[][] = [];
      for (let i = 0; i < snap.data.length; i++) {
        const wave = snap.data[i];
        const bits: number[] = [];
        for (let j = 0; j < wave.voltageAxis.length; j++) {
          bits.push(wave.voltageAxis[j] > 0.5 ? 1 : 0);
        }
        channels.push(bits);
      }
      this.logicChannelData = channels;
      this.logicSampleCount = channels.length > 0 ? channels[0].length : 128;
      this.statusMessage = `逻辑采样: ${channels.length} 通道`;
    } else {
      this.statusMessage = '逻辑采样失败';
    }
  }

  // ==================== Multimeter ====================
  @Builder
  MmPanel() {
    Column({ space: 6 }) {
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: 'DCV', widthVal: 44,
          onAction: () => { this.mmMode = 'DCV'; this.appService.instruments.setMode(MultimeterMode.DCV); } })
        ProteusClassicBtn({ label: 'ACV', widthVal: 44,
          onAction: () => { this.mmMode = 'ACV'; this.appService.instruments.setMode(MultimeterMode.ACV); } })
        ProteusClassicBtn({ label: 'OHM', widthVal: 44,
          onAction: () => { this.mmMode = 'OHM'; this.appService.instruments.setMode(MultimeterMode.RESISTANCE); } })
        ProteusClassicBtn({ label: 'AMP', widthVal: 44,
          onAction: () => { this.mmMode = 'AMP'; this.appService.instruments.setMode(MultimeterMode.CURRENT); } })
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Column() {
        this.ReadoutDisplay(this.mmMode, this.mmReading, '')
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)

      Row({ space: 8 }) {
        ProteusClassicBtn({ label: '自动量程', widthVal: '42%',
          onAction: () => { this.appService.instruments.autoRange(); } })
        ProteusClassicBtn({ label: '测量', widthVal: '42%',
          onAction: () => {
            const r = this.appService.instruments.measure();
            this.statusMessage = r.success ? `万用表读数: ${r.data?.toFixed(4)}` : '测量失败';
          } })
      }
      .width('100%').padding({ left: 8, right: 8, bottom: 8 })
    }
    .width('100%').height('100%')
  }

  // ==================== Signal Generator ====================
  @Builder
  SigGenPanel() {
    Column({ space: 6 }) {
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: '正弦', widthVal: 44,
          onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.SINE); } })
        ProteusClassicBtn({ label: '方波', widthVal: 44,
          onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.SQUARE); } })
        ProteusClassicBtn({ label: '三角', widthVal: 44,
          onAction: () => { this.appService.instruments.setWaveform(SignalWaveform.TRIANGLE); } })
        ProteusClassicBtn({ label: 'Burst', widthVal: 44,
          onAction: () => { this.appService.instruments.setBurstMode(true, 5); } })
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Column({ space: 8 }) {
        Text('频率')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
        TextInput({ text: this.freq })
          .fontSize(16).fontColor(ProteusColors.TEXT_PRIMARY).fontFamily('monospace')
          .width('70%').height(32).borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .textAlign(TextAlign.Center)
          .onChange((v: string) => { this.freq = v; })
        Text('振幅: 3.3V    偏置: 1.65V    占空比: 50%')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)

      ProteusClassicBtn({
        label: '应用参数', widthVal: '86%',
        onAction: () => {
          this.appService.instruments.setParams({
            frequency: 1000, amplitude: 3.3, offset: 1.65, dutyCycle: 50, phase: 0
          });
          this.statusMessage = '信号源参数已更新';
        }
      })
      .margin({ left: 8, right: 8, bottom: 8 })
    }
    .width('100%').height('100%')
  }

  // ==================== UART Terminal ====================
  @Builder
  UartPanel() {
    Column({ space: 6 }) {
      Row({ space: 4 }) {
        TextInput({ text: this.uartHex, placeholder: 'HEX: 55 AA' })
          .fontSize(10).fontColor(ProteusColors.TEXT_PRIMARY)
          .layoutWeight(1).height(ProteusDimens.PARAM_ROW_HEIGHT).borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.uartHex = v; })
        ProteusClassicBtn({ label: '发', widthVal: 36,
          onAction: () => {
            this.appService.instruments.uartHexSend(this.uartHex);
            this.statusMessage = `已发送: ${this.uartHex}`;
          } })
        ProteusClassicBtn({ label: '收', widthVal: 36,
          onAction: () => {
            const r = this.appService.instruments.uartHexReceive();
            this.uartLog = r.data ?? '';
          } })
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Column() {
        Text(this.uartLog.length > 0 ? this.uartLog : '等待接收数据...')
          .fontSize(10)
          .fontColor(this.uartLog.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY)
          .fontFamily('monospace').width('100%')
          .constraintSize({ minHeight: 80 })
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .padding(6).border({ width: 1, color: ProteusColors.DIVIDER })
          .maxLines(16)
      }
      .layoutWeight(1).width('100%').padding({ left: 8, right: 8, bottom: 8 })
    }
    .width('100%').height('100%')
  }

  // ==================== Voltmeter ====================
  @Builder
  VoltmeterPanel() {
    Column({ space: 6 }) {
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: 'DC', widthVal: 36,
          onAction: () => {
            this.vmType = 0; this.vmUnit = 'V DC';
            this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
          } })
        ProteusClassicBtn({ label: 'AC', widthVal: 36,
          onAction: () => {
            this.vmType = 1; this.vmUnit = 'V AC';
            this.appService.instruments.setVoltmeterType(VoltmeterType.AC);
          } })
        Blank()
        Text(`量程: ${this.vmRange}`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Column() {
        this.ReadoutDisplay('VOLTAGE', this.vmReading, this.vmUnit)
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)

      Row({ space: 8 }) {
        ProteusClassicBtn({ label: '自动量程', widthVal: '42%',
          onAction: () => {
            this.appService.instruments.voltmeterAutoRange();
            const cfg = this.appService.instruments.getVoltmeterConfig();
            if (cfg.success && cfg.data) {
              this.vmRange = `${cfg.data.range}V`;
            }
          } })
        ProteusClassicBtn({ label: '测量', widthVal: '42%',
          onAction: () => {
            const r = this.appService.instruments.voltmeterMeasure();
            if (r.success && r.data !== undefined) {
              this.vmReading = r.data.toFixed(3);
            }
            const cfg = this.appService.instruments.getVoltmeterConfig();
            if (cfg.success && cfg.data) {
              this.vmRange = `${cfg.data.range}V`;
              this.vmUnit = cfg.data.unit;
            }
            this.statusMessage = `电压表: ${this.vmReading} ${this.vmUnit}`;
          } })
      }
      .width('100%').padding({ left: 8, right: 8, bottom: 8 })
    }
    .width('100%').height('100%')
  }

  // ==================== Ammeter ====================
  @Builder
  AmmeterPanel() {
    Column({ space: 6 }) {
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: 'DC', widthVal: 36,
          onAction: () => {
            this.amType = 0; this.amUnit = 'mA DC';
            this.appService.instruments.setAmmeterType(AmmeterType.DC);
          } })
        ProteusClassicBtn({ label: 'AC', widthVal: 36,
          onAction: () => {
            this.amType = 1; this.amUnit = 'mA AC';
            this.appService.instruments.setAmmeterType(AmmeterType.AC);
          } })
        Blank()
        Text(`量程: ${this.amRange}`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Column() {
        this.ReadoutDisplay('CURRENT', this.amReading, this.amUnit)
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)

      Row({ space: 8 }) {
        ProteusClassicBtn({ label: '自动量程', widthVal: '42%',
          onAction: () => {
            this.appService.instruments.ammeterAutoRange();
            const cfg = this.appService.instruments.getAmmeterConfig();
            if (cfg.success && cfg.data) {
              this.amRange = `${cfg.data.range}mA`;
            }
          } })
        ProteusClassicBtn({ label: '测量', widthVal: '42%',
          onAction: () => {
            const r = this.appService.instruments.ammeterMeasure();
            if (r.success && r.data !== undefined) {
              this.amReading = r.data.toFixed(2);
            }
            const cfg = this.appService.instruments.getAmmeterConfig();
            if (cfg.success && cfg.data) {
              this.amRange = `${cfg.data.range}mA`;
              this.amUnit = cfg.data.unit;
            }
            this.statusMessage = `电流表: ${this.amReading} ${this.amUnit}`;
          } })
      }
      .width('100%').padding({ left: 8, right: 8, bottom: 8 })
    }
    .width('100%').height('100%')
  }

  // ==================== Power Meter ====================
  @Builder
  PowerMeterPanel() {
    Column({ space: 6 }) {
      ProteusClassicBtn({
        label: '开始测量', widthVal: '86%',
        onAction: () => {
          const r = this.appService.instruments.powerMeterMeasure();
          if (r.success && r.data) {
            this.pmVoltage = r.data.voltage.toFixed(3);
            this.pmCurrent = (r.data.current * 1000).toFixed(2);
            this.pmPower = (r.data.power * 1000).toFixed(1);
            this.pmPF = r.data.powerFactor.toFixed(2);
          }
          this.statusMessage = `功率表: ${this.pmPower}mW, PF=${this.pmPF}`;
        }
      }).margin({ left: 8, right: 8, top: 8 })

      Column({ space: 6 }) {
        this.PmRow('电压', this.pmVoltage, 'V')
        this.PmRow('电流', this.pmCurrent, 'mA')
        this.PmRow('功率', this.pmPower, 'mW')
        this.PmRow('功率因数', this.pmPF, '')
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%').height('100%')
  }

  @Builder
  PmRow(label: string, value: string, unit: string) {
    Row() {
      Text(label)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .width(56)
      Text(value)
        .fontSize(28)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Bold)
        .fontFamily('monospace')
      if (unit.length > 0) {
        Text(unit)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ left: 4 })
      }
    }
    .width('82%')
  }

  // ==================== Frequency Counter ====================
  @Builder
  FreqCounterPanel() {
    Column({ space: 6 }) {
      Row({ space: 4 }) {
        ProteusClassicBtn({ label: '0.1s', widthVal: 40,
          onAction: () => {
            this.fcGateTime = 0.1;
            this.appService.instruments.freqCounterSetGateTime(0.1);
          } })
        ProteusClassicBtn({ label: '1s', widthVal: 36,
          onAction: () => {
            this.fcGateTime = 1.0;
            this.appService.instruments.freqCounterSetGateTime(1.0);
          } })
        ProteusClassicBtn({ label: '10s', widthVal: 36,
          onAction: () => {
            this.fcGateTime = 10;
            this.appService.instruments.freqCounterSetGateTime(10);
          } })
        Blank()
        Text(`闸门: ${this.fcGateTime}s`)
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Column() {
        this.ReadoutDisplay('FREQUENCY', this.fcReading, `Gate: ${this.fcGateTime}s`)
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)

      ProteusClassicBtn({
        label: '测量频率', widthVal: '86%',
        onAction: () => {
          const r = this.appService.instruments.freqCounterMeasure();
          if (r.success && r.data !== undefined) {
            if (r.data >= 1e6) {
              this.fcReading = `${(r.data / 1e6).toFixed(3)} MHz`;
            } else if (r.data >= 1e3) {
              this.fcReading = `${(r.data / 1e3).toFixed(1)} kHz`;
            } else {
              this.fcReading = `${r.data.toFixed(1)} Hz`;
            }
          }
          this.statusMessage = `频率计: ${this.fcReading}`;
        }
      })
      .margin({ left: 8, right: 8, bottom: 8 })
    }
    .width('100%').height('100%')
  }

  private updateCursorMeasure(): void {
    const r = this.appService.instruments.measureCursors(this.cursorAIdx, this.cursorBIdx);
    if (r.success && r.data) {
      this.cursorMeasureText = `ΔT=${(r.data.deltaTime * 1e6).toFixed(2)}μs  ΔV=${r.data.deltaVoltage.toFixed(3)}V  f=${r.data.frequency.toFixed(1)}Hz`;
    }
  }

  private refreshDecodedFrames(): void {
    const frames = this.appService.instruments.getDecodedFrames();
    if (frames.length === 0) {
      this.decodedFramesText = '无解码帧';
      return;
    }
    const lines: string[] = [];
    for (let i = 0; i < Math.min(frames.length, 8); i++) {
      const f = frames[i];
      lines.push(`[${f.protocol}] ${f.data} @${(f.timestamp * 1e6).toFixed(1)}μs`);
    }
    this.decodedFramesText = lines.join('\n');
  }
}
