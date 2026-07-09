/**
 * 示波器波形 Canvas 绘制组件
 */
import { ProteusColors } from '../theme/ProteusTheme';

@Component
export struct OscilloscopeWaveCanvas {
  @Prop timeData: number[] = [];
  @Prop voltageData: number[] = [];
  @Prop channelLabel: string = 'CH1';
  @Prop vPerDiv: number = 1;
  @Prop triggerLevel: number = 0;
  @State canvasW: number = 360;
  @State canvasH: number = 110;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  build() {
    Canvas(this.ctx)
      .width('100%')
      .height(110)
      .backgroundColor('#0a0a12')
      .onAreaChange((old: Area, newArea: Area) => {
        this.canvasW = newArea.width as number;
        this.canvasH = newArea.height as number;
        this.drawWaveform();
      })
      .onAppear(() => this.drawWaveform())
  }

  private drawWaveform(): void {
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;
    if (w <= 0 || h <= 0) return;

    ctx.clearRect(0, 0, w, h);
    // Grid
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 0.5;
    const cols: number = 10;
    const rows: number = 8;
    for (let i = 0; i <= cols; i++) {
      const x = (w / cols) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      const y = (h / rows) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Waveform
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const n = Math.min(this.timeData.length, this.voltageData.length);
    if (n < 2) {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
    } else {
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const v = this.voltageData[i];
        const y = h / 2 - (v / this.vPerDiv) * (h / rows);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    // Trigger level line
    ctx.strokeStyle = '#ff9100';
    ctx.lineWidth = 1;
    const trigY = h / 2 - (this.triggerLevel / this.vPerDiv) * (h / rows);
    ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(0, trigY); ctx.lineTo(w, trigY); ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.fillStyle = '#00e676';
    ctx.font = '10px monospace';
    ctx.fillText(this.channelLabel, 6, 14);
  }
}
