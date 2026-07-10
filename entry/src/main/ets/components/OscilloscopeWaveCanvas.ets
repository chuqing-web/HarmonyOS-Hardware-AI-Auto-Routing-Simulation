/**
 * 示波器波形 Canvas 绘制组件
 * v2: @Watch 数据变化自动重绘 / X轴真实时间 / Y轴自动缩放 / 网格刻度
 */
import { ProteusColors } from '../theme/ProteusTheme';

@Component
export struct OscilloscopeWaveCanvas {
  @Prop @Watch('onDataChanged') timeData: number[] = [];
  @Prop @Watch('onDataChanged') voltageData: number[] = [];
  @Prop channelLabel: string = 'CH1';
  @Prop vPerDiv: number = 1;
  @Prop triggerLevel: number = 0;
  @State canvasW: number = 360;
  @State canvasH: number = 110;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);

  aboutToAppear(): void {
    // 初始绘制在 onAppear 回调中触发
  }

  onDataChanged(): void {
    // @Prop 数据变化时触发重绘
    this.drawWaveform();
  }

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

    const n = Math.min(this.timeData.length, this.voltageData.length);
    if (n < 2) {
      // 无数据时画中心零线
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      // Label
      ctx.fillStyle = '#00e676';
      ctx.font = '10px monospace';
      ctx.fillText(this.channelLabel, 6, 14);
      return;
    }

    // 自动 Y 轴缩放：根据 vPerDiv 确定显示范围，或从数据自动推算
    const vScale = Math.max(this.vPerDiv, 0.001);
    let vMin = -vScale * (rows / 2);
    let vMax = vScale * (rows / 2);

    // 如果 vPerDiv 无法容纳所有数据，自动扩展范围
    for (let i = 0; i < n; i++) {
      const v = this.voltageData[i];
      if (v < vMin) vMin = v - vScale * 0.5;
      if (v > vMax) vMax = v + vScale * 0.5;
    }

    const vRange = vMax - vMin;
    const vCenter = (vMin + vMax) / 2;

    // X 轴：使用真实时间数据
    const tMin = this.timeData[0];
    const tMax = this.timeData[n - 1];
    const tRange = Math.max(tMax - tMin, 1e-15);

    // 波形绘制
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = ((this.timeData[i] - tMin) / tRange) * w;
      const y = h / 2 - ((this.voltageData[i] - vCenter) / vRange) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 触发电平线
    if (this.triggerLevel >= vMin && this.triggerLevel <= vMax) {
      const trigY = h / 2 - ((this.triggerLevel - vCenter) / vRange) * h;
      ctx.strokeStyle = '#ff9100';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(0, trigY); ctx.lineTo(w, trigY); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Label: 通道名 + 电压范围
    ctx.fillStyle = '#00e676';
    ctx.font = '10px monospace';
    ctx.fillText(this.channelLabel, 6, 14);
    // Y轴刻度
    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.fillText(`${vMax.toFixed(2)}V`, w - 48, 12);
    ctx.fillText(`${vMin.toFixed(2)}V`, w - 48, h - 4);
    // X轴时间刻度
    ctx.fillText(`${(tMin * 1e6).toFixed(1)}μs`, 4, h - 4);
    ctx.fillText(`${(tMax * 1e6).toFixed(1)}μs`, w - 52, h - 4);
    // 中心零线标注
    ctx.fillStyle = '#333';
    ctx.font = '8px monospace';
    ctx.fillText('0V', w - 20, h / 2 - 2);
  }
}
