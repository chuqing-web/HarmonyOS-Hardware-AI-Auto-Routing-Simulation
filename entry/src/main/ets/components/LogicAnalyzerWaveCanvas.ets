/**
 * 逻辑分析仪多通道波形 Canvas
 * v2: @Watch 数据变化自动重绘
 */
import { ProteusColors } from '../theme/ProteusTheme';

@Component
export struct LogicAnalyzerWaveCanvas {
  @Prop @Watch('onDataChanged') channelData: number[][] = [];
  @Prop @Watch('onDataChanged') channelCount: number = 8;
  @Prop sampleCount: number = 128;
  @State canvasW: number = 320;
  @State canvasH: number = 192;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  onDataChanged(): void {
    this.drawLogic();
  }

  build() {
    Canvas(this.ctx)
      .width('100%')
      .height(192)
      .backgroundColor('#0a0a12')
      .onAreaChange((old: Area, newArea: Area) => {
        this.canvasW = newArea.width as number;
        this.canvasH = newArea.height as number;
        this.drawLogic();
      })
      .onAppear(() => this.drawLogic())
  }

  drawLogic(): void {
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, w, h);

    const channels = Math.min(this.channelCount, this.channelData.length);
    if (channels === 0) {
      ctx.fillStyle = '#555';
      ctx.font = '10px monospace';
      ctx.fillText('点击采样捕获逻辑波形', 8, h / 2 + 4);
      return;
    }
    const laneH = h / channels;
    // Grid lines
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    for (let ch = 0; ch < channels; ch++) {
      const y = ch * laneH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Channel data
    for (let ch = 0; ch < channels; ch++) {
      const data = this.channelData[ch];
      const yBase = ch * laneH + laneH * 0.75;
      const yHigh = ch * laneH + laneH * 0.25;
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const len = Math.min(data.length, this.sampleCount);
      for (let i = 0; i < len; i++) {
        const x = (i / (len > 1 ? len - 1 : 1)) * w;
        const y = data[i] > 0 ? yHigh : yBase;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Label
      ctx.fillStyle = '#808090';
      ctx.font = '8px monospace';
      ctx.fillText(`D${ch}`, 3, ch * laneH + 10);
    }
  }
}
