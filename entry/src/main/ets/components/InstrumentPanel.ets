/**
 * 虚拟仪器控制面板 — Proteus 风格，示波器/逻辑仪/万用表/信号源/串口/电压表/电流表/功率表/频率计
 */
import { AppService } from '../services/AppService';
import {
  OscTimebase, OscVoltageScale, CouplingMode, TriggerMode, CaptureMode,
  MathChannelOp, MultimeterMode, SignalWaveform, LogicDecodeProtocol,
  VoltmeterType, AmmeterType, traceUiRefresh, traceUiSelect, traceInstrUi,
  detectInstrumentKind, instrumentSubTabForKind, UnitParser
} from 'common';
import { ProteusClassicBtn, ProteusChipGrid, ProteusTextInput } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { OscilloscopeWaveCanvas } from './OscilloscopeWaveCanvas';
import { LogicAnalyzerWaveCanvas } from './LogicAnalyzerWaveCanvas';

interface SelectValueOption {
  value: string;
}

/** Live meter readout — must be @Component+@Prop so timer updates re-render ( @Builder params do not ). */
@Component
struct LiveReadout {
  @Prop label: string = '';
  @Prop value: string = '--';
  @Prop unit: string = '';
  @Prop pulse: number = 0;

  build() {
    Column() {
      Text(this.label)
        .fontSize(ProteusFonts.STATUS)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontFamily('monospace')
      Text(this.value)
        .fontSize(28)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Bold)
        .fontFamily('monospace')
        .key(`v-${this.pulse}-${this.value}`)
      if (this.unit.length > 0) {
        Text(this.unit)
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
}

@Component
struct LivePmRow {
  @Prop label: string = '';
  @Prop value: string = '--';
  @Prop unit: string = '';
  @Prop pulse: number = 0;

  build() {
    Row() {
      Text(this.label)
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .width(56)
      Text(this.value)
        .fontSize(22)
        .fontColor(ProteusColors.TEXT_PRIMARY)
        .fontWeight(FontWeight.Bold)
        .fontFamily('monospace')
        .key(`pm-${this.pulse}-${this.value}`)
      if (this.unit.length > 0) {
        Text(this.unit)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .margin({ left: 4 })
      }
    }
    .width('82%')
  }
}

@Component
export struct InstrumentPanel {
  @Prop @Watch('onSelectionChange') selectedComponentId: string = '';
  @Prop @Watch('onSimWaveTick') simWaveTick: number = 0;
  /** 与主界面仿真运行态同步：停止后清定时器，避免 IDLE 仍刷 INSTR_UI */
  @Prop @Watch('onSimRunningChange') simRunning: boolean = false;
  @Link statusMessage: string;
  @State subTab: number = 0;
  @State selectionRefDes: string = '';
  @State selectionLibraryId: string = '';
  @State timebaseIdx: number = 3; // MS_1 — good default for lab 1kHz AC
  @State voltageScaleIdx: number = 5; // V_1 — matches expanded scale list
  @State triggerLevel: number = 2.0;
  @State logicChannels: number = 8;
  @State threshold: number = 1500;
  @State mmReading: string = '----';
  @State mmMode: string = 'DCV';
  @State freq: string = '1kHz';
  @State sigAmp: string = '1V';
  @State sigOffset: string = '0V';
  @State sigDuty: string = '50';
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
  @State oscAutoFit: boolean = true;
  @State oscStatsText: string = '';
  @State oscTriggerHold: boolean = false;
  @State oscLiveVolts: string = '--';
  /** 递增以强制 Canvas 重绘 */
  @State oscFrameId: number = 0;
  /** Force ArkUI re-render on each poll; also shown in INSTR_UI traces */
  @State uiPulse: number = 0;

  private appService: AppService = AppService.getInstance();
  private timebases: OscTimebase[] = [
    OscTimebase.NS_10, OscTimebase.US_1, OscTimebase.US_100,
    OscTimebase.MS_1, OscTimebase.MS_10, OscTimebase.S_1, OscTimebase.S_10
  ];
  private timebaseLabels: string[] = ['10ns', '1us', '100us', '1ms', '10ms', '1s', '10s'];
  private selTimebase: SelectValueOption[] = [
    { value: '10ns' }, { value: '1us' }, { value: '100us' },
    { value: '1ms' }, { value: '10ms' }, { value: '1s' }, { value: '10s' }
  ];
  private voltageScales: OscVoltageScale[] = [
    OscVoltageScale.MV_1, OscVoltageScale.MV_50, OscVoltageScale.MV_100,
    OscVoltageScale.MV_200, OscVoltageScale.MV_500,
    OscVoltageScale.V_1, OscVoltageScale.V_2, OscVoltageScale.V_5,
    OscVoltageScale.V_10, OscVoltageScale.V_100
  ];
  private voltagePerDiv: number[] = [0.001, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100];
  private voltageScaleLabels: string[] = [
    '1mV', '50mV', '100mV', '200mV', '500mV', '1V', '2V', '5V', '10V', '100V'
  ];
  private selVScale: SelectValueOption[] = [
    { value: '1mV' }, { value: '50mV' }, { value: '100mV' },
    { value: '200mV' }, { value: '500mV' },
    { value: '1V' }, { value: '2V' }, { value: '5V' },
    { value: '10V' }, { value: '100V' }
  ];
  private selLogicCh: SelectValueOption[] = [
    { value: '8' }, { value: '16' }, { value: '32' }
  ];
  private autoRefreshTimer: number = -1;
  private uiLogTick: number = 0;
  private refreshTickCount: number = 0;
  private lastRefreshWallMs: number = 0;
  private readonly refreshIntervalMs: number = 200;
  private subTabLabels: string[] = ['示波', '逻辑', '万用', '信号', '串口', '电压', '电流', '功率', '频率'];

  aboutToAppear(): void {
    this.updateSelectionHeader();
    this.syncSubTabFromSelection();
    this.syncInstrumentContext();
    // Prefer engine timebase (e.g. lab_555 sets MS_10) over panel default MS_1
    const snapTb = this.appService.instruments.getInstrumentSnapshot().oscilloscope.timebase;
    let tbIdx = this.timebases.indexOf(snapTb);
    if (tbIdx < 0) {
      tbIdx = this.timebaseIdx;
    }
    this.timebaseIdx = tbIdx;
    this.appService.instruments.setTimebase(this.timebases[this.timebaseIdx]);
    this.appService.instruments.setVoltageScale(0, this.voltageScales[this.voltageScaleIdx]);
    this.appService.instruments.setTrigger(TriggerMode.EDGE, this.triggerLevel, 0);
    this.appService.instruments.setCaptureMode(
      this.oscTriggerHold ? CaptureMode.SINGLE : CaptureMode.ROLL);
    this.syncSignalGenFieldsFromEngine();
    this.lastRefreshWallMs = Date.now();
    this.refreshTickCount = 0;
    this.autoRefreshReadings('appear');
    // 仅仿真运行时轮询；面板打开时若已在跑则启动定时器
    this.stopAutoRefreshTimer('appear_reset');
    if (this.simRunning) {
      this.startAutoRefreshTimer('appear_running');
    }
  }

  onSimRunningChange(): void {
    if (this.simRunning) {
      this.startAutoRefreshTimer('sim_start');
    } else {
      // 停仿后做最后一次读数（冻结值），再清定时器，避免 TIMER_FIRE 刷屏
      this.autoRefreshReadings('sim_stop');
      this.stopAutoRefreshTimer('sim_stop');
    }
  }

  private startAutoRefreshTimer(reason: string): void {
    if (this.autoRefreshTimer >= 0) {
      return;
    }
    this.lastRefreshWallMs = Date.now();
    this.refreshTickCount = 0;
    this.autoRefreshTimer = setInterval(() => {
      if (!this.simRunning) {
        this.stopAutoRefreshTimer('timer_guard_idle');
        return;
      }
      const now = Date.now();
      const dt = now - this.lastRefreshWallMs;
      this.lastRefreshWallMs = now;
      this.refreshTickCount++;
      traceInstrUi('TIMER_FIRE',
        `#${this.refreshTickCount} dt=${dt}ms expect=${this.refreshIntervalMs}ms ` +
        `tab=${this.subTab}(${this.kindForSubTab(this.subTab)}) ` +
        `sel=${this.selectedComponentId.length > 0 ? this.selectionRefDes : '(none)'} ` +
        `timerId=${this.autoRefreshTimer}`);
      this.autoRefreshReadings('timer');
    }, this.refreshIntervalMs);
    traceInstrUi('TIMER_START',
      `reason=${reason} interval=${this.refreshIntervalMs}ms timerId=${this.autoRefreshTimer} ` +
      `tab=${this.subTab} kind=${this.kindForSubTab(this.subTab)} ` +
      `sel=${this.selectedComponentId} ref=${this.selectionRefDes} lib=${this.selectionLibraryId}`);
  }

  onSelectionChange(): void {
    this.updateSelectionHeader();
    this.syncSubTabFromSelection();
    this.syncInstrumentContext();
    traceInstrUi('SELECT',
      `comp=${this.selectedComponentId} ref=${this.selectionRefDes} ` +
      `lib=${this.selectionLibraryId} tab=${this.subTab} kind=${this.instrKindForSelection()}`);
    const reading = this.autoRefreshReadings('select');
    this.logInstrumentReading(true, reading);
  }

  /** 根据选中器件 libraryId 自动切换到对应仪器子标签 */
  private syncSubTabFromSelection(): void {
    const kind = this.instrKindForSelection();
    const tabIdx = instrumentSubTabForKind(kind);
    if (tabIdx >= 0) {
      this.subTab = tabIdx;
    }
  }

  onSimWaveTick(): void {
    this.autoRefreshReadings('wave');
  }

  private syncInstrumentContext(): void {
    if (this.selectedComponentId.length > 0) {
      this.appService.setActiveInstrumentComponent(this.selectedComponentId);
      this.appService.refreshInstrumentReaderForComponent(this.selectedComponentId);
      // VOLTMETER_DC must stay on DC; AC mode + frozen samples → 0 Vrms and looks "broken"
      const lib = this.selectionLibraryId.toUpperCase();
      if (lib.includes('VOLTMETER_DC') || lib === 'VOLTMETER') {
        this.vmType = 0;
        this.vmUnit = 'V DC';
        this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
      }
    } else {
      this.appService.setActiveInstrumentComponent(null);
    }
    this.syncSignalGenFieldsFromEngine();
  }

  /** AI/原理图写回后：面板振幅不得残留默认 1V，否则「应用参数」会盖掉正确幅度 */
  private syncSignalGenFieldsFromEngine(): void {
    const snap = this.appService.instruments.getInstrumentSnapshot();
    const sg = snap.signalGen;
    if (sg === undefined) {
      return;
    }
    if (Number.isFinite(sg.frequency) && sg.frequency > 0) {
      if (sg.frequency >= 1000) {
        const khz = sg.frequency / 1000;
        this.freq = (Math.abs(khz - Math.round(khz)) < 1e-6)
          ? `${Math.round(khz)}kHz` : `${khz}kHz`;
      } else {
        this.freq = `${sg.frequency}Hz`;
      }
    }
    if (Number.isFinite(sg.amplitude)) {
      this.sigAmp = `${sg.amplitude}V`;
    }
    if (Number.isFinite(sg.offset)) {
      this.sigOffset = `${sg.offset}V`;
    }
    if (Number.isFinite(sg.dutyCycle)) {
      this.sigDuty = `${sg.dutyCycle}`;
    }
  }

  private updateSelectionHeader(): void {
    if (this.selectedComponentId.length === 0) {
      this.selectionRefDes = '';
      this.selectionLibraryId = '';
      return;
    }
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === this.selectedComponentId);
    if (comp !== undefined) {
      this.selectionRefDes = comp.refDes;
      this.selectionLibraryId = comp.libraryId;
    } else {
      this.selectionRefDes = '';
      this.selectionLibraryId = '';
    }
  }

  aboutToDisappear(): void {
    this.stopAutoRefreshTimer('disappear');
  }

  private stopAutoRefreshTimer(reason: string): void {
    if (this.autoRefreshTimer >= 0) {
      const id = this.autoRefreshTimer;
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = -1;
      traceInstrUi('TIMER_STOP', `reason=${reason} timerId=${id} ticks=${this.refreshTickCount}`);
    }
  }

  /** Map visible Instruments sub-tab → engine kind (9 instruments) */
  private kindForSubTab(tab: number): string {
    if (tab === 0) return 'osc';
    if (tab === 1) return 'logic';
    if (tab === 2) return 'dmm';
    if (tab === 3) return 'sig';
    if (tab === 4) return 'uart';
    if (tab === 5) return 'vm';
    if (tab === 6) return 'am';
    if (tab === 7) return 'power';
    if (tab === 8) return 'freq';
    return '';
  }

  /**
   * Auto-refresh the visible instrument tab every 500ms.
   * Uses selection binding when available; still polls engines for scope/logic/uart/etc.
   * without requiring a selected instrument (otherwise the 9 tabs stay frozen).
   */
  autoRefreshReadings(source: string = 'unknown'): string {
    const t0 = Date.now();
    // Prefer the currently visible sub-tab so all 9 instruments can refresh live.
    let instrKind = this.kindForSubTab(this.subTab);
    const selKind = this.instrKindForSelection();
    if (instrKind.length === 0 && selKind.length > 0) {
      instrKind = selKind;
    }
    // Only bind selection as active when it is actually an instrument.
    // Dragging a pot must not steal the voltmeter binding → UI reading 0.
    if (this.selectedComponentId.length > 0 && selKind.length > 0) {
      this.appService.setActiveInstrumentComponent(this.selectedComponentId);
    } else if (instrKind === 'vm' || instrKind === 'dmm' || instrKind === 'am' ||
      instrKind === 'osc' || instrKind === 'power' || instrKind === 'freq') {
      const fallbackId = this.appService.findFirstSchematicInstrumentId(instrKind);
      if (fallbackId.length > 0) {
        this.appService.setActiveInstrumentComponent(fallbackId);
      }
    }
    if (instrKind.length === 0) {
      traceInstrUi('SKIP',
        `src=${source} reason=no_kind tab=${this.subTab} selKind='${selKind}' ` +
        `sel=${this.selectedComponentId} lib=${this.selectionLibraryId}`);
      return '';
    }
    if (instrKind === 'sig') {
      // Signal gen is a source — no live reading board; still pulse UI + log
      this.uiPulse++;
      const reading = `SIG freq=${this.freq}`;
      traceInstrUi('REFRESH',
        `src=${source} kind=sig tab=${this.subTab} pulse=${this.uiPulse} ` +
        `reading=${reading} ms=${Date.now() - t0}`);
      return reading;
    }
    const hasSelection = this.selectedComponentId.length > 0;
    const selectionMatches = hasSelection && (selKind === instrKind ||
      ((instrKind === 'vm' || instrKind === 'dmm') &&
        (selKind === 'vm' || selKind === 'dmm')) ||
      (instrKind === 'am' && selKind === 'am'));
    let dataPath = 'none';
    try {
      if (instrKind === 'dmm') {
        let refreshed = false;
        let readId = selectionMatches ? this.selectedComponentId : '';
        if (readId.length === 0) {
          readId = this.appService.findFirstSchematicInstrumentId('dmm');
        }
        if (readId.length > 0) {
          const delta = this.appService.readVoltmeterDeltaForComponent(readId);
          if (delta !== null) {
            // Instantaneous — pot drag / live edits (avoid rolling-average lag)
            this.appService.instruments.multimeterSnapReading(delta);
            this.mmReading = delta.toFixed(3);
            refreshed = true;
            dataPath = selectionMatches ? 'delta' : 'schematic_dmm';
          }
        }
        if (!refreshed) {
          const mm = this.appService.instruments.measure();
          if (mm.success && mm.data !== undefined) {
            this.mmReading = mm.data.toFixed(3);
            dataPath = 'measure';
          } else {
            dataPath = 'measure_fail';
          }
        }
        const snap = this.appService.instruments.getInstrumentSnapshot();
        if (snap !== undefined) {
          this.mmMode = this.modeLabel(snap.multimeterMode);
        }
      } else if (instrKind === 'vm') {
        let refreshed = false;
        let readId = selectionMatches ? this.selectedComponentId : '';
        if (readId.length === 0) {
          readId = this.appService.findFirstSchematicInstrumentId('vm');
        }
        if (readId.length > 0) {
          const delta = this.appService.readVoltmeterDeltaForComponent(readId);
          if (delta !== null) {
            this.appService.instruments.voltmeterSnapReading(delta);
            this.vmReading = delta.toFixed(3);
            refreshed = true;
            dataPath = selectionMatches ? 'delta' : 'schematic_vm';
          }
        }
        if (!refreshed) {
          const vr = this.appService.instruments.voltmeterMeasure();
          if (vr.success && vr.data !== undefined) {
            this.vmReading = vr.data.toFixed(3);
            dataPath = 'measure';
          } else {
            dataPath = 'measure_fail';
          }
        }
        const vcfg = this.appService.instruments.getVoltmeterConfig();
        if (vcfg.success && vcfg.data !== undefined) {
          this.vmRange = `${vcfg.data.range}V`;
          this.vmUnit = vcfg.data.unit ?? 'V DC';
        }
      } else if (instrKind === 'am') {
        let refreshed = false;
        let readId = selectionMatches ? this.selectedComponentId : '';
        if (readId.length === 0) {
          readId = this.appService.findFirstSchematicInstrumentId('am');
        }
        if (readId.length > 0) {
          const mA = this.appService.readAmmeterCurrentForComponent(readId);
          if (mA !== null) {
            this.appService.instruments.ammeterSnapReading(mA);
            this.amReading = mA.toFixed(3);
            refreshed = true;
            dataPath = selectionMatches ? 'delta' : 'schematic_am';
          }
        }
        if (!refreshed) {
          const ar = this.appService.instruments.ammeterMeasure();
          if (ar.success && ar.data !== undefined) {
            this.amReading = ar.data.toFixed(3);
            dataPath = 'measure';
          } else {
            dataPath = 'measure_fail';
          }
        }
        const acfg = this.appService.instruments.getAmmeterConfig();
        if (acfg.success && acfg.data !== undefined) {
          this.amRange = `${acfg.data.range}mA`;
          this.amUnit = acfg.data.unit ?? 'mA DC';
        }
      } else if (instrKind === 'osc') {
        if (this.oscAutoFit) {
          this.applyOscAutoScale();
        }
        const osc = this.appService.instruments.getOscilloscopeWave(0);
        if (osc.success && osc.data) {
          this.waveTimeData = osc.data.timeAxis.slice();
          this.waveVoltageData = osc.data.voltageAxis.slice();
          this.oscFrameId = this.oscFrameId + 1;
          this.updateOscStatsText(osc.data.voltageAxis, osc.data.timeAxis);
          const last = InstrumentPanel.lastFinite(osc.data.voltageAxis);
          if (last !== null) {
            this.oscLiveVolts = `${last.toFixed(3)} V`;
          }
          dataPath = `wave pts=${osc.data.voltageAxis.length}`;
        } else {
          dataPath = 'wave_empty';
        }
        const osc2 = this.appService.instruments.getOscilloscopeWave(1);
        if (osc2.success && osc2.data && InstrumentPanel.isLiveScopeChannel(osc2.data.netName)) {
          this.waveCh2Data = osc2.data.voltageAxis.slice();
        } else {
          this.waveCh2Data = [];
        }
      } else if (instrKind === 'power') {
        const pmId = selectionMatches ? this.selectedComponentId :
          this.appService.findFirstSchematicInstrumentId('power');
        const snap = pmId.length > 0 ? this.appService.readPowerMeterForComponent(pmId) : null;
        if (snap !== null) {
          this.pmVoltage = snap.voltage.toFixed(3);
          this.pmCurrent = (snap.current * 1000).toFixed(2);
          this.pmPower = (snap.power * 1000).toFixed(1);
          this.pmPF = snap.powerFactor.toFixed(2);
          dataPath = selectionMatches ? 'delta' : 'schematic_pm';
        } else {
          const pm = this.appService.instruments.powerMeterMeasure();
          if (pm.success && pm.data) {
            this.pmVoltage = pm.data.voltage.toFixed(3);
            this.pmCurrent = (pm.data.current * 1000).toFixed(2);
            this.pmPower = (pm.data.power * 1000).toFixed(1);
            this.pmPF = pm.data.powerFactor.toFixed(2);
            dataPath = 'measure';
          } else {
            dataPath = 'measure_fail';
          }
        }
      } else if (instrKind === 'freq') {
        const fc = this.appService.instruments.freqCounterMeasure();
        if (fc.success && fc.data !== undefined) {
          if (fc.data >= 1000000) {
            this.fcReading = `${(fc.data / 1000000).toFixed(3)} MHz`;
          } else if (fc.data >= 1000) {
            this.fcReading = `${(fc.data / 1000).toFixed(1)} kHz`;
          } else {
            this.fcReading = `${fc.data.toFixed(0)} Hz`;
          }
          dataPath = 'measure';
        } else {
          dataPath = 'measure_fail';
        }
      } else if (instrKind === 'logic') {
        const logic = this.appService.instruments.getLogicWaveData();
        if (logic.success && logic.data !== undefined) {
          const channels: number[][] = [];
          for (let i = 0; i < logic.data.length; i++) {
            const wave = logic.data[i];
            const bits: number[] = [];
            for (let j = 0; j < wave.voltageAxis.length; j++) {
              bits.push(wave.voltageAxis[j] > 0.5 ? 1 : 0);
            }
            channels.push(bits.slice());
          }
          this.logicChannelData = channels;
          this.logicSampleCount = channels.length > 0 ? channels[0].length : 128;
          if (channels.length > 0) {
            this.logicChannels = channels.length;
          }
          dataPath = `ch=${channels.length}`;
        } else {
          dataPath = 'wave_empty';
        }
      } else if (instrKind === 'uart') {
        this.uartLog = this.appService.instruments.getUartLog();
        dataPath = `logLen=${this.uartLog.length}`;
      } else {
        dataPath = `unhandled_kind=${instrKind}`;
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : `${e}`;
      traceInstrUi('ERROR',
        `src=${source} kind=${instrKind} tab=${this.subTab} err=${errMsg}`);
    }
    this.uiPulse++;
    const reading = this.buildReadingSummary(instrKind);
    traceInstrUi('REFRESH',
      `src=${source} kind=${instrKind} tab=${this.subTab} ` +
      `match=${selectionMatches ? 1 : 0} path=${dataPath} pulse=${this.uiPulse} ` +
      `sel=${this.selectionRefDes || '(none)'} reading=${reading} ms=${Date.now() - t0}`);
    this.logInstrumentReading(false, reading);
    return reading;
  }

  private logInstrumentReading(onSelect: boolean, readingOverride: string = ''): void {
    if (this.selectedComponentId.length === 0) {
      return;
    }
    const kind = this.instrKindForSelection();
    if (kind.length === 0) {
      return;
    }
    this.uiLogTick++;
    if (!onSelect && this.uiLogTick % 20 !== 0) {
      return;
    }
    const reading = readingOverride.length > 0 ? readingOverride : this.buildReadingSummary(kind);
    if (onSelect) {
      traceUiSelect('Instr', this.selectedComponentId, this.selectionRefDes,
        this.selectionLibraryId, kind, reading);
    } else {
      traceUiRefresh('Instr', this.selectedComponentId, this.selectionRefDes,
        this.selectionLibraryId, kind, reading);
    }
  }

  private buildReadingSummary(kind: string): string {
    if (kind === 'dmm') return `DMM ${this.mmReading}`;
    if (kind === 'vm') return `VM ${this.vmReading} ${this.vmUnit}`;
    if (kind === 'am') return `AM ${this.amReading} ${this.amUnit}`;
    if (kind === 'power') return `PM V=${this.pmVoltage} I=${this.pmCurrent} P=${this.pmPower}`;
    if (kind === 'freq') return `FC ${this.fcReading}`;
    if (kind === 'osc') {
      const pts = this.waveVoltageData.length;
      const lastV = InstrumentPanel.lastFinite(this.waveVoltageData);
      const last = lastV !== null ? lastV.toFixed(4) : '--';
      return `OSC pts=${pts} last=${last}V ch2=${this.waveCh2Data.length}`;
    }
    if (kind === 'logic') return `LA ch=${this.logicChannels} samples=${this.logicSampleCount}`;
    if (kind === 'uart') return `UART logLen=${this.uartLog.length}`;
    return kind;
  }

  private instrKindForSelection(): string {
    return detectInstrumentKind(this.selectionLibraryId);
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

  build() {
    Column() {
      this.SelectionHeader()
      this.InstrumentSubTabBar()
      Column() {
        if (this.subTab === 0) {
          this.OscPanel()
        } else if (this.subTab === 1) {
          this.LogicPanel()
        } else if (this.subTab === 2) {
          this.MmPanel()
        } else if (this.subTab === 3) {
          this.SigGenPanel()
        } else if (this.subTab === 4) {
          this.UartPanel()
        } else if (this.subTab === 5) {
          this.VoltmeterPanel()
        } else if (this.subTab === 6) {
          this.AmmeterPanel()
        } else if (this.subTab === 7) {
          this.PowerMeterPanel()
        } else if (this.subTab === 8) {
          this.FreqCounterPanel()
        }
      }
      .layoutWeight(1)
      .width('100%')
    }
    .backgroundColor(ProteusColors.CANVAS_BG)
    .width('100%')
    .height('100%')
  }

  /** 仪器子标签 — 按面板宽度 3 列换行排列 */
  @Builder
  InstrumentSubTabBar() {
    Column() {
      ProteusChipGrid({
        labels: this.subTabLabels,
        selectedIdx: this.subTab,
        colsPerRow: 3,
        onSelect: (idx: number) => {
          this.subTab = idx;
          traceInstrUi('TAB', `tab=${idx} kind=${this.kindForSubTab(idx)}`);
          this.autoRefreshReadings('tab');
        }
      })
    }
    .width('100%')
    .padding({ left: 6, right: 6, top: 5, bottom: 5 })
    .backgroundColor(ProteusColors.TAB_BAR_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
  }

  /** 顶部选中器件信息 — 避免与下方控件挤在同一视觉层 */
  @Builder
  SelectionHeader() {
    Column({ space: 2 }) {
      Row() {
        Text(this.selectionRefDes.length > 0 ? this.selectionRefDes : 'Instruments')
          .fontSize(13)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
        Text(`#${this.uiPulse}`)
          .fontSize(9)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .fontFamily('monospace')
      }
      .width('100%')
      Text(this.selectionLibraryId.length > 0 ? this.selectionLibraryId : '选中画布上的仪器以关联读数')
        .fontSize(10)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
    }
    .width('100%')
    .padding({ left: 10, right: 10, top: 8, bottom: 6 })
    .backgroundColor(ProteusColors.PANEL_TITLE_BG)
    .border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER })
    .alignItems(HorizontalAlign.Start)
  }

  // ==================== Readout Display (shared) — replaced by LiveReadout @Component

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
      Column({ space: 8 }) {
        // Row 1: timebase
        Row({ space: 6 }) {
          Text('时基')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width(32)
          Select(this.selTimebase)
            .selected(this.timebaseIdx).value(this.timebaseLabels[this.timebaseIdx])
            .font({ size: 11 }).fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .layoutWeight(1)
            .height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onSelect((idx: number) => {
              this.timebaseIdx = idx;
              this.oscAutoFit = false;
              this.appService.instruments.setTimebase(this.timebases[idx]);
            })
        }
        .width('100%').padding({ left: 8, right: 8, top: 6 })

        // Row 2: voltage scale
        Row({ space: 6 }) {
          Text('档位')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width(32)
          Select(this.selVScale)
            .selected(this.voltageScaleIdx)
            .value(this.voltageScaleLabels[this.voltageScaleIdx])
            .font({ size: 11 }).fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .layoutWeight(1)
            .height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onSelect((idx: number) => {
              this.voltageScaleIdx = idx;
              this.oscAutoFit = false;
              this.appService.instruments.setVoltageScale(0, this.voltageScales[idx]);
              this.appService.instruments.setVoltageScale(1, this.voltageScales[idx]);
            })
        }
        .width('100%').padding({ left: 8, right: 8 })

        // Row 3: coupling + capture
        Row({ space: 6 }) {
          ProteusClassicBtn({ label: 'AC', widthVal: '24%',
            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.AC); } })
          ProteusClassicBtn({ label: 'DC', widthVal: '24%',
            onAction: () => { this.appService.instruments.setCoupling(0, CouplingMode.DC); } })
          ProteusClassicBtn({
            label: this.oscAutoFit ? '自适应' : '固定档',
            widthVal: '24%',
            onAction: () => {
              this.oscAutoFit = !this.oscAutoFit;
              if (this.oscAutoFit) {
                this.applyOscAutoScale();
                this.captureWave();
              }
            }
          })
          ProteusClassicBtn({
            label: this.oscTriggerHold ? '触发锁' : '滚动',
            widthVal: '24%',
            onAction: () => {
              this.oscTriggerHold = !this.oscTriggerHold;
              this.appService.instruments.setCaptureMode(
                this.oscTriggerHold ? CaptureMode.SINGLE : CaptureMode.ROLL);
              this.captureWave();
            }
          })
        }
        .width('100%').padding({ left: 8, right: 8 })

        Row({ space: 6 }) {
          ProteusClassicBtn({ label: '采样', widthVal: '48%',
            onAction: () => { this.captureWave(); } })
          ProteusClassicBtn({ label: 'FFT', widthVal: '48%',
            onAction: () => { this.appService.instruments.setMathChannel(MathChannelOp.FFT, true); } })
        }
        .width('100%').padding({ left: 8, right: 8 })

        // Row 4: trigger slider
        Column({ space: 4 }) {
          Text(this.oscTriggerHold
            ? `触发锁 ${this.triggerLevel.toFixed(2)} V（稳像）`
            : `滚动模式 · 实时 ${this.oscLiveVolts}`)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width('100%')
          Slider({ value: this.triggerLevel, min: -5, max: 5, step: 0.05 })
            .width('100%')
            .height(ProteusDimens.PARAM_ROW_HEIGHT)
            .enabled(this.oscTriggerHold)
            .onChange((v: number) => {
              this.triggerLevel = v;
              this.appService.instruments.setTrigger(TriggerMode.EDGE, v, 0);
            })
        }
        .width('100%')
        .padding({ left: 8, right: 8 })

        // 主波形区：始终显示，无数据时显示空屏提示
        Column({ space: 4 }) {
          OscilloscopeWaveCanvas({
            timeData: this.waveTimeData,
            voltageData: this.waveVoltageData,
            frameId: this.oscFrameId,
            channelLabel: 'CH1',
            waveColor: '#00e676',
            vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
            tPerDiv: this.timebaseSecPerDiv(),
            triggerLevel: this.triggerLevel,
            autoFit: this.oscAutoFit,
            canvasHeight: 168,
            showStats: true
          })
          if (this.waveCh2Data.length > 1) {
            OscilloscopeWaveCanvas({
              timeData: this.waveTimeData,
              voltageData: this.waveCh2Data,
              frameId: this.oscFrameId,
              channelLabel: 'CH2',
              waveColor: '#40c4ff',
              vPerDiv: this.voltagePerDiv[this.voltageScaleIdx],
              tPerDiv: this.timebaseSecPerDiv(),
              triggerLevel: this.triggerLevel,
              autoFit: this.oscAutoFit,
              canvasHeight: 120,
              showStats: true
            })
          }
          if (this.oscStatsText.length > 0) {
            Text(this.oscStatsText)
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.HOVER_PREVIEW)
              .maxLines(2)
              .width('100%')
              .padding({ left: 4, right: 4 })
          }
        }
        .width('100%').padding({ left: 4, right: 4 })

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

  private timebaseSecPerDiv(): number {
    const secs: number[] = [10e-9, 1e-6, 100e-6, 1e-3, 10e-3, 1, 10];
    return this.timebaseIdx < secs.length ? secs[this.timebaseIdx] : 1e-3;
  }

  /** Sync panel Select + engine when 自适应 is on (freq / Vpp driven). */
  private applyOscAutoScale(): void {
    const r = this.appService.instruments.autoAdjustOscilloscope(0);
    if (!r.success || r.data === undefined || !r.data.changed) {
      return;
    }
    const tbIdx = this.timebases.indexOf(r.data.timebase);
    if (tbIdx >= 0) {
      this.timebaseIdx = tbIdx;
    }
    const vsIdx = this.voltageScales.indexOf(r.data.voltageScale);
    if (vsIdx >= 0) {
      this.voltageScaleIdx = vsIdx;
    }
  }

  private captureWave(): void {
    for (let ch = 0; ch < 4; ch++) {
      const snap = this.appService.instruments.getOscilloscopeWave(ch);
      if (snap.success && snap.data) {
        if (ch === 0) {
          this.waveTimeData = snap.data.timeAxis.slice();
          this.waveVoltageData = snap.data.voltageAxis.slice();
          this.oscFrameId = this.oscFrameId + 1;
          this.updateOscStatsText(snap.data.voltageAxis, snap.data.timeAxis);
          const last = InstrumentPanel.lastFinite(snap.data.voltageAxis);
          if (last !== null) {
            this.oscLiveVolts = `${last.toFixed(3)} V`;
          }
        } else if (ch === 1) {
          if (InstrumentPanel.isLiveScopeChannel(snap.data.netName)) {
            this.waveCh2Data = snap.data.voltageAxis.slice();
          } else {
            this.waveCh2Data = [];
          }
        }
      }
    }
  }

  /** CH2+ only when bound to a real net (not placeholder OSC_CHx). */
  private static isLiveScopeChannel(netName: string): boolean {
    if (netName.length === 0) {
      return false;
    }
    const upper = netName.toUpperCase();
    return !upper.startsWith('OSC_CH');
  }

  private static lastFinite(values: number[]): number | null {
    for (let i = values.length - 1; i >= 0; i--) {
      const v = values[i];
      if (Number.isFinite(v)) {
        return v;
      }
    }
    return null;
  }

  private updateOscStatsText(volts: number[], times: number[]): void {
    if (volts.length < 2) {
      this.oscStatsText = '';
      return;
    }
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < volts.length; i++) {
      const v = volts[i];
      if (!Number.isFinite(v)) {
        continue;
      }
      if (v < minV) {
        minV = v;
      }
      if (v > maxV) {
        maxV = v;
      }
      sum += v;
      count++;
    }
    if (count < 2) {
      this.oscStatsText = '';
      return;
    }
    const avg = sum / count;
    const m = this.appService.instruments.measureCursors(0, volts.length - 1);
    let freqText = '--';
    if (m.success && m.data !== undefined && m.data.frequency > 0) {
      const f = m.data.frequency;
      if (f >= 1000) {
        freqText = `${(f / 1000).toFixed(1)} kHz`;
      } else {
        freqText = `${f.toFixed(1)} Hz`;
      }
    }
    const tSpan = Math.abs(times[times.length - 1] - times[0]);
    let spanText = `${(tSpan * 1e6).toFixed(1)} us`;
    if (tSpan >= 1) {
      spanText = `${tSpan.toFixed(3)} s`;
    } else if (tSpan >= 1e-3) {
      spanText = `${(tSpan * 1e3).toFixed(2)} ms`;
    }
    this.oscStatsText =
      `窗宽 ${spanText}  |  Vmin ${minV.toFixed(3)}V  Vmax ${maxV.toFixed(3)}V  Avg ${avg.toFixed(3)}V  |  f ${freqText}`;
  }

  // ==================== Logic Analyzer ====================
  @Builder
  LogicPanel() {
    Scroll() {
      Column({ space: 8 }) {
        Row({ space: 6 }) {
          Text('通道')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width(32)
          Select(this.selLogicCh)
            .selected(0).font({ size: 11 }).fontColor(ProteusColors.TEXT_PRIMARY)
            .backgroundColor(ProteusColors.CANVAS_BG)
            .layoutWeight(1)
            .height(ProteusDimens.PARAM_ROW_HEIGHT)
            .onSelect((idx: number) => {
              this.logicChannels = [8, 16, 32][idx];
              this.appService.instruments.setChannels(this.logicChannels);
            })
        }
        .width('100%').padding({ left: 8, right: 8, top: 6 })

        Row({ space: 6 }) {
          Text('阈值')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .width(32)
          ProteusTextInput({
            text: `${this.threshold}`,
            onChange: (v: string) => {
              this.threshold = parseInt(v) || 1500;
              this.appService.instruments.setThreshold(this.threshold);
            }
          })
            .layoutWeight(1)
          Text('mV')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .width(24)
        }
        .width('100%').padding({ left: 8, right: 8 })

        Row({ space: 6 }) {
          ProteusClassicBtn({ label: 'UART', widthVal: '48%',
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.UART, 115200); this.refreshDecodedFrames(); } })
          ProteusClassicBtn({ label: 'I2C', widthVal: '48%',
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.I2C); this.refreshDecodedFrames(); } })
        }
        .width('100%').padding({ left: 8, right: 8 })

        Row({ space: 6 }) {
          ProteusClassicBtn({ label: 'SPI', widthVal: '48%',
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.SPI); this.refreshDecodedFrames(); } })
          ProteusClassicBtn({ label: 'CAN', widthVal: '48%',
            onAction: () => { this.appService.instruments.decodeBus(LogicDecodeProtocol.CAN); } })
        }
        .width('100%').padding({ left: 8, right: 8 })

        Row({ space: 6 }) {
          ProteusClassicBtn({ label: '采样', widthVal: '100%',
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
    Column({ space: 8 }) {
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'DCV', widthVal: '48%',
          onAction: () => { this.mmMode = 'DCV'; this.appService.instruments.setMode(MultimeterMode.DCV); } })
        ProteusClassicBtn({ label: 'ACV', widthVal: '48%',
          onAction: () => { this.mmMode = 'ACV'; this.appService.instruments.setMode(MultimeterMode.ACV); } })
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'OHM', widthVal: '48%',
          onAction: () => { this.mmMode = 'OHM'; this.appService.instruments.setMode(MultimeterMode.RESISTANCE); } })
        ProteusClassicBtn({ label: 'AMP', widthVal: '48%',
          onAction: () => { this.mmMode = 'AMP'; this.appService.instruments.setMode(MultimeterMode.CURRENT); } })
      }
      .width('100%').padding({ left: 8, right: 8 })

      Column() {
        LiveReadout({
          label: this.mmMode,
          value: this.mmReading,
          unit: '',
          pulse: this.uiPulse
        })
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
    Column({ space: 8 }) {
      Row({ space: 6 }) {
        ProteusClassicBtn({ label: '正弦', widthVal: '48%',
          onAction: () => {
            this.statusMessage = this.appService.applySignalGenWaveform(
              SignalWaveform.SINE, this.selectedComponentId);
          } })
        ProteusClassicBtn({ label: '方波', widthVal: '48%',
          onAction: () => {
            this.statusMessage = this.appService.applySignalGenWaveform(
              SignalWaveform.SQUARE, this.selectedComponentId);
          } })
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Row({ space: 6 }) {
        ProteusClassicBtn({ label: '三角', widthVal: '32%',
          onAction: () => {
            this.statusMessage = this.appService.applySignalGenWaveform(
              SignalWaveform.TRIANGLE, this.selectedComponentId);
          } })
        ProteusClassicBtn({ label: '锯齿', widthVal: '32%',
          onAction: () => {
            this.statusMessage = this.appService.applySignalGenWaveform(
              SignalWaveform.SAW, this.selectedComponentId);
          } })
        ProteusClassicBtn({ label: '脉冲', widthVal: '32%',
          onAction: () => {
            this.statusMessage = this.appService.applySignalGenWaveform(
              SignalWaveform.PULSE, this.selectedComponentId);
          } })
      }
      .width('100%').padding({ left: 8, right: 8 })

      Row({ space: 6 }) {
        ProteusClassicBtn({ label: 'Burst', widthVal: '48%',
          onAction: () => { this.appService.instruments.setBurstMode(true, 5); } })
      }
      .width('100%').padding({ left: 8, right: 8 })

      Column({ space: 6 }) {
        Row({ space: 6 }) {
          Text('频率').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
          ProteusTextInput({
            text: this.freq, mono: true,
            onChange: (v: string) => { this.freq = v; }
          }).layoutWeight(1).height(30)
        }.width('92%').alignItems(VerticalAlign.Center)

        Row({ space: 6 }) {
          Text('振幅').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
          ProteusTextInput({
            text: this.sigAmp, mono: true,
            onChange: (v: string) => { this.sigAmp = v; }
          }).layoutWeight(1).height(30)
        }.width('92%').alignItems(VerticalAlign.Center)

        Row({ space: 6 }) {
          Text('偏置').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
          ProteusTextInput({
            text: this.sigOffset, mono: true,
            onChange: (v: string) => { this.sigOffset = v; }
          }).layoutWeight(1).height(30)
        }.width('92%').alignItems(VerticalAlign.Center)

        Row({ space: 6 }) {
          Text('占空比%').fontSize(ProteusFonts.PARAM_KEY).fontColor(ProteusColors.TEXT_LABEL).width(48)
          ProteusTextInput({
            text: this.sigDuty, mono: true,
            onChange: (v: string) => { this.sigDuty = v; }
          }).layoutWeight(1).height(30)
        }.width('92%').alignItems(VerticalAlign.Center)

        Text('占空比对方波有效；频率支持 1kHz / 500Hz 等写法')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_SECONDARY)
          .width('92%')
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)

      ProteusClassicBtn({
        label: '应用参数', widthVal: '86%',
        onAction: () => {
          const fp = UnitParser.parseFrequency(this.freq);
          const amp = parseFloat(this.sigAmp.replace(/[Vv]/g, ''));
          const off = parseFloat(this.sigOffset.replace(/[Vv]/g, ''));
          const duty = parseFloat(this.sigDuty.replace(/%/g, ''));
          if (!fp.valid || fp.numeric <= 0) {
            this.statusMessage = `频率无效: ${this.freq}`;
            return;
          }
          if (!Number.isFinite(amp) || !Number.isFinite(off) || !Number.isFinite(duty)) {
            this.statusMessage = '振幅/偏置/占空比无效';
            return;
          }
          if (duty <= 0 || duty > 100) {
            this.statusMessage = '占空比须在 1–100%';
            return;
          }
          this.statusMessage = this.appService.applySignalGenParams(
            fp.numeric, amp, off, duty, this.selectedComponentId);
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
        ProteusTextInput({
          text: this.uartHex,
          placeholder: 'HEX: 55 AA',
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
            // Show full TX/RX log — not hexReceive() raw buffer (was 5555… spam)
            this.uartLog = this.appService.instruments.getUartLog();
            this.statusMessage = this.uartLog.length > 0 ? '已刷新接收日志' : '暂无数据';
          } })
      }
      .width('100%').padding({ left: 8, right: 8, top: 6 })

      Row() {
        Text('接收日志')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_LABEL)
        Blank()
        if (this.uartLog.length > 0) {
          Text('清空')
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .padding({ left: 6, right: 6, top: 2, bottom: 2 })
            .onClick(() => {
              this.appService.instruments.clearUartLog();
              this.uartLog = '';
            })
        }
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      // 独立滚动视口：日志变长时不撑爆右侧栏，也不与发送行互相挤压
      Scroll() {
        Text(this.uartLog.length > 0 ? this.uartLog : '等待接收数据...')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(this.uartLog.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY)
          .fontFamily('monospace')
          .width('100%')
          .textAlign(TextAlign.Start)
      }
      .width('100%')
      .height(120)
      .padding(6)
      .margin({ left: 8, right: 8, bottom: 8 })
      .backgroundColor(ProteusColors.INPUT_READONLY_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .scrollBar(BarState.Auto)
      .align(Alignment.TopStart)
      .edgeEffect(EdgeEffect.None)
    }
    .width('100%')
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
            // VOLTMETER_DC symbol is a DC meter; keep AC optional only for generic meters
            const lib = this.selectionLibraryId.toUpperCase();
            if (lib.includes('VOLTMETER_DC')) {
              this.vmType = 0; this.vmUnit = 'V DC';
              this.appService.instruments.setVoltmeterType(VoltmeterType.DC);
              this.statusMessage = 'VOLTMETER_DC 固定为直流档';
              return;
            }
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
        LiveReadout({
          label: 'VOLTAGE',
          value: this.vmReading,
          unit: this.vmUnit,
          pulse: this.uiPulse
        })
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
            let reading: number | null = null;
            let readId = '';
            if (this.selectedComponentId.length > 0 &&
              detectInstrumentKind(this.selectionLibraryId) === 'vm') {
              readId = this.selectedComponentId;
            }
            if (readId.length === 0) {
              readId = this.appService.findFirstSchematicInstrumentId('vm');
            }
            if (readId.length > 0) {
              const delta = this.appService.readVoltmeterDeltaForComponent(readId);
              if (delta !== null) {
                this.appService.instruments.voltmeterSnapReading(delta);
                reading = delta;
              }
            }
            if (reading === null) {
              const r = this.appService.instruments.voltmeterMeasure();
              if (r.success && r.data !== undefined) {
                reading = r.data;
              }
            }
            if (reading !== null) {
              this.vmReading = reading.toFixed(3);
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
        LiveReadout({
          label: 'CURRENT',
          value: this.amReading,
          unit: this.amUnit,
          pulse: this.uiPulse
        })
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
        LivePmRow({ label: '电压', value: this.pmVoltage, unit: 'V', pulse: this.uiPulse })
        LivePmRow({ label: '电流', value: this.pmCurrent, unit: 'mA', pulse: this.uiPulse })
        LivePmRow({ label: '功率', value: this.pmPower, unit: 'mW', pulse: this.uiPulse })
        LivePmRow({ label: '功率因数', value: this.pmPF, unit: '', pulse: this.uiPulse })
      }
      .layoutWeight(1).width('100%').justifyContent(FlexAlign.Center)
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%').height('100%')
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
        LiveReadout({
          label: 'FREQUENCY',
          value: this.fcReading,
          unit: `Gate: ${this.fcGateTime}s`,
          pulse: this.uiPulse
        })
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
