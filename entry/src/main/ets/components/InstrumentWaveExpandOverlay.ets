/**
 * 仪器波形全屏放大弹窗 — 示波器 / 逻辑仪 / 电压表 / 电流表 / 频率计
 * 时域默认铺满一次仿真全历史；可放大细节并平移回看。
 */
import { ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors } from '../theme/ProteusTheme';
import { OscilloscopeWaveCanvas } from './OscilloscopeWaveCanvas';
import { LogicAnalyzerWaveCanvas } from './LogicAnalyzerWaveCanvas';
import {
  InstrumentWaveExpandStore
} from './InstrumentWaveExpandStore';

@Component
export struct InstrumentWaveExpandOverlay {
  @Prop @Watch('onRefreshTick') refreshTick: number = 0;
  onClose: () => void = () => {};

  @State private title: string = '';
  @State private detail: string = '';
  @State private kind: string = 'osc';
  @State private frameId: number = 0;
  @State private timeData: number[] = [];
  @State private voltageData: number[] = [];
  @State private timeData2: number[] = [];
  @State private voltageData2: number[] = [];
  @State private showCh2: boolean = false;
  @State private channelLabel: string = 'CH1';
  @State private waveColor: string = '#00e676';
  @State private ch2Label: string = 'CH2';
  @State private ch2Color: string = '#40c4ff';
  @State private vPerDiv: number = 1;
  @State private tPerDiv: number = 1e-3;
  @State private triggerLevel: number = 0;
  @State private autoFit: boolean = true;
  @State private freqDomain: boolean = false;
  @State private channelData: number[][] = [];
  @State private channelCount: number = 8;
  @State private sampleCount: number = 128;
  @State private viewZoom: number = 1;
  @State private viewPanSec: number = 0;
  private panStartSec: number = 0;
  private pinchStartZoom: number = 1;
  /** 打开后已做过「铺满全历史」；实时刷新不再强行复位缩放 */
  private viewBootstrapped: boolean = false;
  /** 处于全览跟随时：仿真历史变长仍铺满全程 */
  private followFullOverview: boolean = true;

  aboutToAppear(): void {
    this.viewBootstrapped = false;
    this.followFullOverview = true;
    this.pullFromStore();
    this.resetView();
    this.viewBootstrapped = true;
  }

  onRefreshTick(): void {
    this.pullFromStore();
  }

  private pullFromStore(): void {
    const s = InstrumentWaveExpandStore.getInstance();
    this.title = s.title;
    this.detail = s.detail;
    this.kind = s.kind;
    this.frameId = s.frameId;
    this.timeData = s.timeData.slice();
    this.voltageData = s.voltageData.slice();
    this.timeData2 = s.timeData2.slice();
    this.voltageData2 = s.voltageData2.slice();
    this.showCh2 = s.showCh2;
    this.channelLabel = s.channelLabel;
    this.waveColor = s.waveColor;
    this.ch2Label = s.ch2Label;
    this.ch2Color = s.ch2Color;
    this.vPerDiv = s.vPerDiv;
    this.tPerDiv = s.tPerDiv;
    this.triggerLevel = s.triggerLevel;
    this.autoFit = s.autoFit;
    this.freqDomain = s.freqDomain;
    this.channelCount = s.channelCount;
    this.sampleCount = s.sampleCount;
    const chCopy: number[][] = [];
    for (let i = 0; i < s.channelData.length; i++) {
      chCopy.push(s.channelData[i].slice());
    }
    this.channelData = chCopy;
    if (this.viewBootstrapped && this.followFullOverview) {
      this.viewZoom = this.getFitZoom();
      this.viewPanSec = 0;
    } else {
      this.viewPanSec = this.clampPan(this.viewPanSec);
    }
  }

  private close(): void {
    InstrumentWaveExpandStore.getInstance().close();
    this.onClose();
  }

  /** 有效有限样点的历史跨度（忽略写屏 NaN） */
  private getHistorySpan(): number {
    const n = Math.min(this.timeData.length, this.voltageData.length);
    if (n < 2) {
      return 0;
    }
    let tFirst = Number.NaN;
    let tLast = Number.NaN;
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(this.timeData[i]) && Number.isFinite(this.voltageData[i])) {
        tFirst = this.timeData[i];
        break;
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      if (Number.isFinite(this.timeData[i]) && Number.isFinite(this.voltageData[i])) {
        tLast = this.timeData[i];
        break;
      }
    }
    if (!Number.isFinite(tFirst) || !Number.isFinite(tLast)) {
      return 0;
    }
    return Math.max(tLast - tFirst, 0);
  }

  /** 铺满全历史所需缩放（≤1）；历史短于时基窗时为 1 */
  private getFitZoom(): number {
    if (this.freqDomain) {
      return 1;
    }
    const hist = this.getHistorySpan();
    const base = Math.max(this.tPerDiv * 10, 1e-12);
    if (hist <= base + 1e-15) {
      return 1;
    }
    return Math.max(base / hist, 0.01);
  }

  private getWindowSpan(): number {
    return Math.max(this.tPerDiv * 10 / Math.max(this.viewZoom, 0.01), 1e-12);
  }

  private getMaxPanSec(): number {
    const hist = this.getHistorySpan();
    return Math.max(hist - this.getWindowSpan(), 0);
  }

  private clampPan(next: number): number {
    let v = next;
    if (v < 0) {
      v = 0;
    }
    const maxPan = this.getMaxPanSec();
    if (v > maxPan) {
      v = maxPan;
    }
    return v;
  }

  private applyZoom(z: number): void {
    const fit = this.getFitZoom();
    let next = z;
    // 允许缩小到刚好铺满全历史；放大上限 32×
    if (next < fit) {
      next = fit;
    }
    if (next < 0.01) {
      next = 0.01;
    }
    if (next > 32) {
      next = 32;
    }
    this.viewZoom = next;
    this.followFullOverview = next <= fit * 1.001;
    this.viewPanSec = this.clampPan(this.viewPanSec);
  }

  private zoomIn(): void {
    this.applyZoom(this.viewZoom * 1.4);
  }

  private zoomOut(): void {
    this.applyZoom(this.viewZoom / 1.4);
  }

  private resetView(): void {
    // 复位 = 铺满一次仿真全历史（而非仅时基窗）
    this.followFullOverview = true;
    this.viewZoom = this.getFitZoom();
    this.viewPanSec = 0;
  }

  private panByFraction(frac: number): void {
    const span = this.getWindowSpan();
    this.followFullOverview = false;
    this.viewPanSec = this.clampPan(this.viewPanSec + frac * span);
  }

  private setPanFromSlider(norm: number): void {
    // 滑杆左=历史(回看)，右=最新(跟随)
    const maxPan = this.getMaxPanSec();
    const t = Math.max(0, Math.min(1000, norm)) / 1000;
    this.followFullOverview = false;
    this.viewPanSec = this.clampPan((1 - t) * maxPan);
  }

  private panSliderValue(): number {
    const maxPan = this.getMaxPanSec();
    if (maxPan <= 1e-15) {
      return 1000;
    }
    return Math.max(0, Math.min(1000, (1 - this.viewPanSec / maxPan) * 1000));
  }

  private handleAxisZoom(event: AxisEvent): void {
    if (this.kind === 'la') {
      return;
    }
    const v = event.getVerticalAxisValue();
    if (v === 0) {
      return;
    }
    // 滚轮向前(负)放大，向后(正)缩小
    const factor = v < 0 ? 1.15 : (1 / 1.15);
    this.applyZoom(this.viewZoom * factor);
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#000000B0')
        .onClick(() => {
          this.close();
        })

      Column({ space: 10 }) {
        Row() {
          Text(this.title.length > 0 ? this.title : '波形详情')
            .fontSize(18)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .fontWeight(FontWeight.Medium)
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(`#${this.refreshTick}`)
            .fontSize(12)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .fontFamily('monospace')
            .margin({ right: 8 })
          ProteusClassicBtn({
            label: '关闭',
            widthVal: 64,
            onAction: () => {
              this.close();
            }
          })
        }
        .width('100%')

        if (this.kind !== 'la') {
          Row({ space: 6 }) {
            ProteusClassicBtn({
              label: '放大',
              widthVal: 56,
              onAction: () => {
                this.zoomIn();
              }
            })
            ProteusClassicBtn({
              label: '缩小',
              widthVal: 56,
              onAction: () => {
                this.zoomOut();
              }
            })
            ProteusClassicBtn({
              label: '←',
              widthVal: 40,
              onAction: () => {
                this.panByFraction(0.35);
              }
            })
            ProteusClassicBtn({
              label: '→',
              widthVal: 40,
              onAction: () => {
                this.panByFraction(-0.35);
              }
            })
            ProteusClassicBtn({
              label: '全览',
              widthVal: 56,
              onAction: () => {
                this.resetView();
              }
            })
            Text(`×${this.viewZoom.toFixed(2)}  span=${this.getHistorySpan().toExponential(1)}s`)
              .fontSize(12)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .fontFamily('monospace')
              .layoutWeight(1)
          }
          .width('100%')
        }

        Scroll() {
          Column({ space: 8 }) {
            if (this.kind === 'la') {
              LogicAnalyzerWaveCanvas({
                channelData: this.channelData,
                channelCount: this.channelCount,
                sampleCount: this.sampleCount,
                canvasHeight: 420
              })
                .width('100%')
            } else {
              Column() {
                OscilloscopeWaveCanvas({
                  timeData: this.timeData,
                  voltageData: this.voltageData,
                  frameId: this.frameId,
                  channelLabel: this.channelLabel,
                  waveColor: this.waveColor,
                  vPerDiv: this.vPerDiv,
                  tPerDiv: this.tPerDiv,
                  triggerLevel: this.triggerLevel,
                  autoFit: this.autoFit,
                  freqDomain: this.freqDomain,
                  canvasHeight: this.showCh2 ? 280 : 380,
                  showStats: true,
                  viewZoom: this.viewZoom,
                  viewPanSec: this.viewPanSec
                })
                  .width('100%')
                if (this.showCh2 && this.voltageData2.length > 1) {
                  OscilloscopeWaveCanvas({
                    timeData: this.timeData2.length > 1 ? this.timeData2 : this.timeData,
                    voltageData: this.voltageData2,
                    frameId: this.frameId,
                    channelLabel: this.ch2Label,
                    waveColor: this.ch2Color,
                    vPerDiv: this.vPerDiv,
                    tPerDiv: this.tPerDiv,
                    triggerLevel: this.triggerLevel,
                    autoFit: this.autoFit,
                    freqDomain: this.freqDomain,
                    canvasHeight: 280,
                    showStats: true,
                    viewZoom: this.viewZoom,
                    viewPanSec: this.viewPanSec
                  })
                    .width('100%')
                }
              }
              .width('100%')
              .focusable(true)
              .onAxisEvent((event: AxisEvent) => {
                this.handleAxisZoom(event);
              })
              .gesture(
                GestureGroup(GestureMode.Exclusive,
                  PinchGesture({ fingers: 2 })
                    .onActionStart(() => {
                      this.pinchStartZoom = this.viewZoom;
                    })
                    .onActionUpdate((e: GestureEvent) => {
                      const s = e.scale;
                      if (!Number.isFinite(s) || s <= 0.05) {
                        return;
                      }
                      this.applyZoom(this.pinchStartZoom * s);
                    }),
                  PanGesture({ direction: PanDirection.Horizontal, distance: 4 })
                    .onActionStart(() => {
                      this.panStartSec = this.viewPanSec;
                    })
                    .onActionUpdate((e: GestureEvent) => {
                      const span = this.getWindowSpan();
                      // 右拖看更新（减小 pan）；左拖看历史（增大 pan）
                      const deltaSec = (-e.offsetX / 360) * span;
                      this.followFullOverview = false;
                      this.viewPanSec = this.clampPan(this.panStartSec + deltaSec);
                    })
                )
              )
            }

            if (this.kind !== 'la') {
              Row({ space: 8 }) {
                Text('历史')
                  .fontSize(12)
                  .fontColor(ProteusColors.TEXT_SECONDARY)
                  .width(36)
                Slider({
                  value: this.panSliderValue(),
                  min: 0,
                  max: 1000,
                  step: 1
                })
                  .layoutWeight(1)
                  .enabled(this.getMaxPanSec() > 1e-15)
                  .onChange((v: number) => {
                    this.setPanFromSlider(v);
                  })
                Text('最新')
                  .fontSize(12)
                  .fontColor(ProteusColors.TEXT_SECONDARY)
                  .width(36)
              }
              .width('100%')
              .padding({ top: 4, bottom: 2 })
            }

            Text(this.kind === 'la'
              ? '逻辑波形'
              : '默认全览整次仿真 · 滚轮/双指缩放细节 · 滑杆或拖动平移')
              .fontSize(12)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .width('100%')

            if (this.detail.length > 0) {
              Text(this.detail)
                .fontSize(15)
                .fontColor(ProteusColors.HOVER_PREVIEW)
                .fontFamily('monospace')
                .width('100%')
                .maxLines(20)
            } else {
              Text('本次仿真尚无波形数据。启动仿真后双击侧栏波形可查看详情。')
                .fontSize(14)
                .fontColor(ProteusColors.TEXT_SECONDARY)
                .width('100%')
            }
          }
          .width('100%')
        }
        .layoutWeight(1)
        .width('100%')
      }
      .width('92%')
      .height('88%')
      .padding(16)
      .backgroundColor(ProteusColors.CANVAS_BG)
      .border({ width: 1, color: ProteusColors.DIVIDER })
      .shadow({ radius: 16, color: '#00000080' })
      .focusable(true)
      .onAxisEvent((event: AxisEvent) => {
        this.handleAxisZoom(event);
      })
      .onClick(() => {
        // 吞掉点击，避免点到内容区关闭
      })
    }
    .width('100%')
    .height('100%')
  }
}
