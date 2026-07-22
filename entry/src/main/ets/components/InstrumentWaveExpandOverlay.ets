/**
 * 仪器波形全屏放大弹窗 — 示波器 / 逻辑仪 / 电压表 / 电流表 / 频率计
 */
import { ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';
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
  @State private channelData: number[][] = [];
  @State private channelCount: number = 8;
  @State private sampleCount: number = 128;
  @State private viewZoom: number = 1;
  @State private viewPanSec: number = 0;
  private panStartSec: number = 0;
  private pinchStartZoom: number = 1;

  aboutToAppear(): void {
    this.pullFromStore();
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
    this.channelCount = s.channelCount;
    this.sampleCount = s.sampleCount;
    const chCopy: number[][] = [];
    for (let i = 0; i < s.channelData.length; i++) {
      chCopy.push(s.channelData[i].slice());
    }
    this.channelData = chCopy;
  }

  private close(): void {
    InstrumentWaveExpandStore.getInstance().close();
    this.onClose();
  }

  private zoomIn(): void {
    this.viewZoom = Math.min(16, this.viewZoom * 1.4);
  }

  private zoomOut(): void {
    this.viewZoom = Math.max(0.25, this.viewZoom / 1.4);
  }

  private resetView(): void {
    this.viewZoom = 1;
    this.viewPanSec = 0;
  }

  private panByFraction(frac: number): void {
    const span = Math.max(this.tPerDiv * 10 / Math.max(this.viewZoom, 0.05), 1e-12);
    let next = this.viewPanSec + frac * span;
    if (next < 0) {
      next = 0;
    }
    const n = Math.min(this.timeData.length, this.voltageData.length);
    if (n >= 2) {
      const t0 = this.timeData[0];
      const t1 = this.timeData[n - 1];
      const hist = Math.max(t1 - t0, 0);
      const maxPan = Math.max(hist - span, 0);
      if (next > maxPan) {
        next = maxPan;
      }
    }
    this.viewPanSec = next;
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
            .fontSize(16)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .fontWeight(FontWeight.Medium)
            .layoutWeight(1)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(`#${this.refreshTick}`)
            .fontSize(10)
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
              label: '复位',
              widthVal: 56,
              onAction: () => {
                this.resetView();
              }
            })
            Text(`×${this.viewZoom.toFixed(1)}  pan=${this.viewPanSec.toExponential(1)}s`)
              .fontSize(10)
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
                    canvasHeight: 280,
                    showStats: true,
                    viewZoom: this.viewZoom,
                    viewPanSec: this.viewPanSec
                  })
                    .width('100%')
                }
              }
              .width('100%')
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
                      let z = this.pinchStartZoom * s;
                      if (z < 0.25) {
                        z = 0.25;
                      }
                      if (z > 16) {
                        z = 16;
                      }
                      this.viewZoom = z;
                    }),
                  PanGesture({ direction: PanDirection.Horizontal, distance: 4 })
                    .onActionStart(() => {
                      this.panStartSec = this.viewPanSec;
                    })
                    .onActionUpdate((e: GestureEvent) => {
                      const span = Math.max(this.tPerDiv * 10 / Math.max(this.viewZoom, 0.05), 1e-12);
                      // 右拖看更新（减小 pan）；左拖看历史（增大 pan）
                      const deltaSec = (-e.offsetX / 360) * span;
                      let next = this.panStartSec + deltaSec;
                      if (next < 0) {
                        next = 0;
                      }
                      const n = Math.min(this.timeData.length, this.voltageData.length);
                      if (n >= 2) {
                        const hist = Math.max(this.timeData[n - 1] - this.timeData[0], 0);
                        const maxPan = Math.max(hist - span, 0);
                        if (next > maxPan) {
                          next = maxPan;
                        }
                      }
                      this.viewPanSec = next;
                    })
                )
              )
            }

            Text(this.kind === 'la'
              ? '逻辑波形'
              : '滚动显示最新窗；双指缩放，左右拖动平移；按钮亦可调节')
              .fontSize(9)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .width('100%')

            if (this.detail.length > 0) {
              Text(this.detail)
                .fontSize(ProteusFonts.STATUS)
                .fontColor(ProteusColors.HOVER_PREVIEW)
                .fontFamily('monospace')
                .width('100%')
                .maxLines(20)
            } else {
              Text('本次仿真尚无波形数据。启动仿真后双击侧栏波形可查看详情。')
                .fontSize(ProteusFonts.STATUS)
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
      .onClick(() => {
        // 吞掉点击，避免点到内容区关闭
      })
    }
    .width('100%')
    .height('100%')
  }
}
