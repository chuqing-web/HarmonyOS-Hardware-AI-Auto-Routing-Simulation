/**
 * 示波器波形 Canvas — CRT 风格网格 / 刻度 / 统计 HUD / 折线迹线
 * 注意：Harmony Canvas 必须在 onReady 之后绘制，否则迹线会丢。
 */

@Component
export struct OscilloscopeWaveCanvas {
  @Prop @Watch('onDataChanged') timeData: number[] = [];
  @Prop @Watch('onDataChanged') voltageData: number[] = [];
  /** 父组件每次刷新递增，强制触发重绘（绕过 @Prop 数组有时不触发 Watch） */
  @Prop @Watch('onDataChanged') frameId: number = 0;
  @Prop channelLabel: string = 'CH1';
  @Prop waveColor: string = '#00e676';
  @Prop @Watch('onDataChanged') vPerDiv: number = 1;
  @Prop tPerDiv: number = 1e-3;
  @Prop triggerLevel: number = 0;
  @Prop @Watch('onDataChanged') autoFit: boolean = true;
  @Prop canvasHeight: number = 160;
  @Prop showStats: boolean = true;
  @State canvasW: number = 360;
  @State canvasH: number = 160;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private readonly cols: number = 10;
  private readonly rows: number = 8;
  private canvasReady: boolean = false;
  /** EMA of Y window — stops autoFit from jumping every frame */
  private emaVMin: number = 0;
  private emaVMax: number = 1;
  private scaleInit: boolean = false;

  onDataChanged(): void {
    this.scheduleDraw();
  }

  build() {
    Canvas(this.ctx)
      .width('100%')
      .height(this.canvasHeight)
      .backgroundColor('#07070d')
      .border({ width: 1, color: '#1e2738' })
      .onReady(() => {
        this.canvasReady = true;
        this.canvasH = this.canvasHeight;
        this.drawWaveform();
      })
      .onAreaChange((_old: Area, newArea: Area) => {
        const w = Number(newArea.width);
        const h = Number(newArea.height);
        if (w > 1) {
          this.canvasW = w;
        }
        if (h > 1) {
          this.canvasH = h;
        }
        this.scheduleDraw();
      })
      .onAppear(() => {
        this.canvasH = this.canvasHeight;
        this.scheduleDraw();
      })
  }

  private scheduleDraw(): void {
    if (!this.canvasReady) {
      return;
    }
    this.drawWaveform();
  }

  private drawWaveform(): void {
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;
    if (w <= 1 || h <= 1) {
      return;
    }

    ctx.clearRect(0, 0, w, h);
    this.drawBackground(ctx, w, h);
    this.drawGrid(ctx, w, h);

    const n = Math.min(this.timeData.length, this.voltageData.length);
    if (n < 2) {
      this.drawEmptyState(ctx, w, h);
      return;
    }

    const scale = this.computeScale(n);
    this.drawZeroLine(ctx, w, h, scale.vMin, scale.vMax);
    this.drawTrigger(ctx, w, h, scale.vMin, scale.vMax);
    this.drawTrace(ctx, w, h, n, scale.vMin, scale.vMax);
    this.drawHudHeaders(ctx, w, h, n, scale.vMin, scale.vMax, scale.tMin, scale.tMax);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#07070d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#141a28';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cols = this.cols;
    const rows = this.rows;
    ctx.strokeStyle = '#121826';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= cols * 5; i++) {
      const x = (w / (cols * 5)) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let i = 0; i <= rows * 5; i++) {
      const y = (h / (rows * 5)) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#243049';
    ctx.lineWidth = 1;
    for (let i = 0; i <= cols; i++) {
      const x = (w / cols) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      const y = (h / rows) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#354663';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  private drawEmptyState(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = '#2a3348';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = this.waveColor;
    ctx.font = '11px monospace';
    ctx.fillText(this.channelLabel, 8, 16);

    ctx.fillStyle = '#6b7a99';
    ctx.font = '12px monospace';
    ctx.fillText('NO SIGNAL', w / 2 - 36, h / 2 - 6);
    ctx.font = '10px monospace';
    ctx.fillText('运行仿真后自动刷新 / 点"采样"', Math.max(8, w / 2 - 90), h / 2 + 14);
  }

  private computeScale(n: number): ScaleWindow {
    const rows = this.rows;
    const vDiv = Math.max(this.vPerDiv, 1e-6);

    let dataMin = Number.POSITIVE_INFINITY;
    let dataMax = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const v = this.voltageData[i];
      if (!Number.isFinite(v)) {
        continue;
      }
      if (v < dataMin) {
        dataMin = v;
      }
      if (v > dataMax) {
        dataMax = v;
      }
      sum += v;
      count++;
    }
    if (count < 1 || !Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
      dataMin = -vDiv * (rows / 2);
      dataMax = vDiv * (rows / 2);
      sum = 0;
      count = 1;
    }
    const mean = sum / count;
    const vpp = Math.max(dataMax - dataMin, 1e-6);

    let vMin: number;
    let vMax: number;

    if (this.autoFit) {
      // 以信号中心为基准，不要强行把 0V 拉进画面（否则 2.2V 正弦会被压到顶部）
      const half = Math.max(vpp * 0.65, vDiv * 1.5, 0.05);
      let targetMin = mean - half;
      let targetMax = mean + half;
      if (!this.scaleInit) {
        this.emaVMin = targetMin;
        this.emaVMax = targetMax;
        this.scaleInit = true;
      } else {
        const a = 0.28;
        this.emaVMin = a * targetMin + (1 - a) * this.emaVMin;
        this.emaVMax = a * targetMax + (1 - a) * this.emaVMax;
      }
      vMin = this.emaVMin;
      vMax = this.emaVMax;
    } else {
      this.scaleInit = false;
      // 固定档：按 V/div × 格数，中心对齐信号均值
      const half = vDiv * (rows / 2);
      vMin = mean - half;
      vMax = mean + half;
    }

    const t0 = Number.isFinite(this.timeData[0]) ? this.timeData[0] : 0;
    const t1 = Number.isFinite(this.timeData[n - 1]) ? this.timeData[n - 1] : t0;
    return {
      vMin: vMin,
      vMax: vMax,
      tMin: t0,
      tMax: t1
    };
  }

  private drawZeroLine(ctx: CanvasRenderingContext2D, w: number, h: number,
    vMin: number, vMax: number): void {
    if (0 < vMin || 0 > vMax) {
      return;
    }
    const y = this.voltageToY(0, h, vMin, vMax);
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6b7a99';
    ctx.font = '9px monospace';
    ctx.fillText('0V', 4, y - 3);
  }

  private drawTrigger(ctx: CanvasRenderingContext2D, w: number, h: number,
    vMin: number, vMax: number): void {
    if (this.triggerLevel < vMin || this.triggerLevel > vMax) {
      return;
    }
    const y = this.voltageToY(this.triggerLevel, h, vMin, vMax);
    ctx.strokeStyle = '#ff9100';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ff9100';
    ctx.font = '9px monospace';
    ctx.fillText(`T ${this.formatVoltage(this.triggerLevel)}`, w - 56, y - 3);
  }

  /**
   * 引擎已重采样为均匀时间轴 → 按索引映射 X。
   * 过密时每像素取中点（不做 max/min 交替，避免长时间显示成锯齿乱线）。
   */
  private drawTrace(ctx: CanvasRenderingContext2D, w: number, h: number, n: number,
    vMin: number, vMax: number): void {
    const xs: number[] = [];
    const ys: number[] = [];

    if (n <= Math.floor(w) + 2) {
      for (let i = 0; i < n; i++) {
        const v = this.voltageData[i];
        if (!Number.isFinite(v)) {
          continue;
        }
        const x = n > 1 ? (i / (n - 1)) * w : 0;
        xs.push(x);
        ys.push(this.voltageToY(v, h, vMin, vMax));
      }
    } else {
      const buckets = Math.max(Math.floor(w), 64);
      for (let b = 0; b < buckets; b++) {
        const i0 = Math.floor((b / buckets) * n);
        const i1 = Math.min(n, Math.floor(((b + 1) / buckets) * n));
        if (i1 <= i0) {
          continue;
        }
        const mid = i0 + ((i1 - i0) >> 1);
        let v = this.voltageData[mid];
        if (!Number.isFinite(v)) {
          // fall back to first finite in bucket
          v = Number.NaN;
          for (let i = i0; i < i1; i++) {
            if (Number.isFinite(this.voltageData[i])) {
              v = this.voltageData[i];
              break;
            }
          }
        }
        if (!Number.isFinite(v)) {
          continue;
        }
        const x = buckets > 1 ? (b / (buckets - 1)) * w : 0;
        xs.push(x);
        ys.push(this.voltageToY(v, h, vMin, vMax));
      }
    }

    if (xs.length < 2) {
      return;
    }

    ctx.strokeStyle = this.withAlpha(this.waveColor, 0.25);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.strokePolyline(ctx, xs, ys);

    ctx.strokeStyle = this.waveColor;
    ctx.lineWidth = 1.7;
    this.strokePolyline(ctx, xs, ys);
  }

  private strokePolyline(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]): void {
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    for (let i = 1; i < xs.length; i++) {
      ctx.lineTo(xs[i], ys[i]);
    }
    ctx.stroke();
  }

  private drawHudHeaders(ctx: CanvasRenderingContext2D, w: number, h: number, n: number,
    vMin: number, vMax: number, tMin: number, tMax: number): void {
    const stats = this.computeStats(n);
    ctx.fillStyle = this.waveColor;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(this.channelLabel, 8, 15);

    ctx.fillStyle = '#8fa0bf';
    ctx.font = '9px monospace';
    ctx.fillText(`${this.formatVoltage(vMax)}`, w - 54, 12);
    ctx.fillText(`${this.formatVoltage(vMin)}`, w - 54, h - 6);
    // 横轴显示窗宽（相对时间），不是仿真绝对时刻
    const span = Math.max(tMax - tMin, 0);
    ctx.fillText('0', 8, h - 6);
    ctx.fillText(this.formatTime(span), w / 2 - 20, h - 6);
    ctx.fillText(`${this.formatTime(this.tPerDiv)}/div`, w - 62, h - 6);

    if (!this.showStats) {
      return;
    }
    let nowV = this.voltageData[n - 1];
    if (!Number.isFinite(nowV)) {
      nowV = stats.avg;
    }
    const line = `Vpp ${this.formatVoltage(stats.vpp)}  ` +
      `Avg ${this.formatVoltage(stats.avg)}  ` +
      `f ${this.formatFreq(stats.freq)}  ` +
      `now ${this.formatVoltage(nowV)}`;
    ctx.fillStyle = '#c8d4ea';
    ctx.font = '10px monospace';
    ctx.fillText(line, 8, 30);

    ctx.fillStyle = '#6b7a99';
    ctx.font = '9px monospace';
    ctx.fillText(`${this.formatVoltage(this.vPerDiv)}/div`, w - 58, 28);
  }

  private computeStats(n: number): WaveStats {
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const v = this.voltageData[i];
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
    if (count < 1) {
      return { vpp: 0, avg: 0, freq: 0, minV: 0, maxV: 0 };
    }
    const avg = sum / count;
    let crossings = 0;
    let firstT = -1;
    let lastT = -1;
    const thr = avg;
    for (let i = 1; i < n; i++) {
      const a = this.voltageData[i - 1];
      const b = this.voltageData[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        continue;
      }
      if (a <= thr && b > thr) {
        if (firstT < 0) {
          firstT = this.timeData[i];
        } else {
          lastT = this.timeData[i];
          crossings++;
        }
      }
    }
    let freq = 0;
    if (crossings > 0 && firstT >= 0 && lastT > firstT) {
      freq = crossings / (lastT - firstT);
    }
    return { vpp: maxV - minV, avg: avg, freq: freq, minV: minV, maxV: maxV };
  }

  private voltageToY(v: number, h: number, vMin: number, vMax: number): number {
    const range = Math.max(vMax - vMin, 1e-15);
    const y = h - ((v - vMin) / range) * h;
    if (y < 0) {
      return 0;
    }
    if (y > h) {
      return h;
    }
    return y;
  }

  private formatVoltage(v: number): string {
    if (!Number.isFinite(v)) {
      return '--';
    }
    const a = Math.abs(v);
    if (a >= 100) {
      return `${v.toFixed(0)}V`;
    }
    if (a >= 1) {
      return `${v.toFixed(2)}V`;
    }
    if (a >= 0.001) {
      return `${(v * 1000).toFixed(1)}mV`;
    }
    return `${(v * 1e6).toFixed(1)}uV`;
  }

  private formatTime(t: number): string {
    if (!Number.isFinite(t)) {
      return '--';
    }
    const a = Math.abs(t);
    if (a >= 1) {
      return `${t.toFixed(3)}s`;
    }
    if (a >= 1e-3) {
      return `${(t * 1e3).toFixed(2)}ms`;
    }
    if (a >= 1e-6) {
      return `${(t * 1e6).toFixed(1)}us`;
    }
    return `${(t * 1e9).toFixed(1)}ns`;
  }

  private formatFreq(f: number): string {
    if (!(f > 0) || f !== f) {
      return '--';
    }
    if (f >= 1e6) {
      return `${(f / 1e6).toFixed(2)}MHz`;
    }
    if (f >= 1e3) {
      return `${(f / 1e3).toFixed(1)}kHz`;
    }
    return `${f.toFixed(1)}Hz`;
  }

  private withAlpha(hex: string, alpha: number): string {
    if (hex.length === 7 && hex.charAt(0) === '#') {
      const r = parseInt(hex.substring(1, 3), 16);
      const g = parseInt(hex.substring(3, 5), 16);
      const b = parseInt(hex.substring(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return hex;
  }
}

interface ScaleWindow {
  vMin: number;
  vMax: number;
  tMin: number;
  tMax: number;
}

interface WaveStats {
  vpp: number;
  avg: number;
  freq: number;
  minV: number;
  maxV: number;
}
