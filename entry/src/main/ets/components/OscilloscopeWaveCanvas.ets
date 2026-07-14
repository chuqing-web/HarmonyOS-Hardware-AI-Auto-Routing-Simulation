/**
 * 示波器波形 Canvas — CRT 风格网格 / 刻度 / 统计 HUD / 平滑迹线
 */

@Component
export struct OscilloscopeWaveCanvas {
  @Prop @Watch('onDataChanged') timeData: number[] = [];
  @Prop @Watch('onDataChanged') voltageData: number[] = [];
  @Prop channelLabel: string = 'CH1';
  @Prop waveColor: string = '#00e676';
  @Prop vPerDiv: number = 1;
  @Prop triggerLevel: number = 0;
  @Prop autoFit: boolean = true;
  @Prop canvasHeight: number = 160;
  @Prop showStats: boolean = true;
  @State canvasW: number = 360;
  @State canvasH: number = 160;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private ctx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private readonly cols: number = 10;
  private readonly rows: number = 8;
  /** EMA of Y window — stops autoFit from jumping every frame */
  private emaVMin: number = 0;
  private emaVMax: number = 1;
  private scaleInit: boolean = false;

  onDataChanged(): void {
    this.drawWaveform();
  }

  build() {
    Canvas(this.ctx)
      .width('100%')
      .height(this.canvasHeight)
      .backgroundColor('#07070d')
      .border({ width: 1, color: '#1e2738' })
      .onAreaChange((_old: Area, newArea: Area) => {
        this.canvasW = Number(newArea.width);
        this.canvasH = Number(newArea.height);
        this.drawWaveform();
      })
      .onAppear(() => {
        this.canvasH = this.canvasHeight;
        this.drawWaveform();
      })
  }

  private drawWaveform(): void {
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;
    if (w <= 0 || h <= 0) {
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
    this.drawSmoothWave(ctx, w, h, n, scale.vMin, scale.vMax, scale.tMin, scale.tMax);
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
    let vMin = -vDiv * (rows / 2);
    let vMax = vDiv * (rows / 2);

    let dataMin = this.voltageData[0];
    let dataMax = this.voltageData[0];
    for (let i = 1; i < n; i++) {
      const v = this.voltageData[i];
      if (v < dataMin) {
        dataMin = v;
      }
      if (v > dataMax) {
        dataMax = v;
      }
    }

    if (this.autoFit) {
      const span = Math.max(dataMax - dataMin, vDiv * 0.25, 1e-6);
      const pad = span * 0.18;
      let targetMin = Math.min(dataMin - pad, 0);
      let targetMax = Math.max(dataMax + pad, 0);
      if (targetMax - targetMin < vDiv) {
        const mid = (dataMin + dataMax) / 2;
        targetMin = mid - vDiv * (rows / 4);
        targetMax = mid + vDiv * (rows / 4);
      }
      if (!this.scaleInit) {
        this.emaVMin = targetMin;
        this.emaVMax = targetMax;
        this.scaleInit = true;
      } else {
        const a = 0.18;
        this.emaVMin = a * targetMin + (1 - a) * this.emaVMin;
        this.emaVMax = a * targetMax + (1 - a) * this.emaVMax;
      }
      vMin = this.emaVMin;
      vMax = this.emaVMax;
    } else {
      this.scaleInit = false;
      const mid = (dataMin + dataMax) / 2;
      const half = vDiv * (rows / 2);
      vMin = mid - half;
      vMax = mid + half;
      if (dataMin < vMin) {
        vMin = dataMin - vDiv * 0.25;
      }
      if (dataMax > vMax) {
        vMax = dataMax + vDiv * 0.25;
      }
    }

    return {
      vMin: vMin,
      vMax: vMax,
      tMin: this.timeData[0],
      tMax: this.timeData[n - 1]
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
   * Downsample to ~1 point/pixel, then Catmull-Rom → cubic Bezier.
   * Avoids the old min/max envelope which painted vertical spikes on every bucket.
   */
  private drawSmoothWave(ctx: CanvasRenderingContext2D, w: number, h: number, n: number,
    vMin: number, vMax: number, tMin: number, tMax: number): void {
    const tRange = Math.max(tMax - tMin, 1e-15);
    const targetPts = Math.max(Math.min(Math.floor(w), 480), 64);
    const xs: number[] = [];
    const ys: number[] = [];

    if (n <= targetPts) {
      for (let i = 0; i < n; i++) {
        xs.push(((this.timeData[i] - tMin) / tRange) * w);
        ys.push(this.voltageToY(this.voltageData[i], h, vMin, vMax));
      }
    } else {
      for (let p = 0; p < targetPts; p++) {
        const tNorm = targetPts > 1 ? p / (targetPts - 1) : 0;
        const tAbs = tMin + tNorm * tRange;
        // binary-ish scan via index map
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
          const mid = Math.floor((lo + hi) / 2);
          if (this.timeData[mid] < tAbs) {
            lo = mid;
          } else {
            hi = mid;
          }
        }
        const dt = Math.max(this.timeData[hi] - this.timeData[lo], 1e-15);
        const f = Math.max(0, Math.min(1, (tAbs - this.timeData[lo]) / dt));
        const v = this.voltageData[lo] + f * (this.voltageData[hi] - this.voltageData[lo]);
        xs.push(tNorm * w);
        ys.push(this.voltageToY(v, h, vMin, vMax));
      }
    }

    if (xs.length < 2) {
      return;
    }

    // Soft glow
    ctx.strokeStyle = this.withAlpha(this.waveColor, 0.2);
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.strokeCatmullRom(ctx, xs, ys);

    // Main trace
    ctx.strokeStyle = this.waveColor;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.strokeCatmullRom(ctx, xs, ys);
  }

  private strokeCatmullRom(ctx: CanvasRenderingContext2D, xs: number[], ys: number[]): void {
    const n = xs.length;
    ctx.beginPath();
    ctx.moveTo(xs[0], ys[0]);
    if (n === 2) {
      ctx.lineTo(xs[1], ys[1]);
      ctx.stroke();
      return;
    }
    for (let i = 0; i < n - 1; i++) {
      const i0 = Math.max(i - 1, 0);
      const i1 = i;
      const i2 = i + 1;
      const i3 = Math.min(i + 2, n - 1);
      const p0x = xs[i0];
      const p0y = ys[i0];
      const p1x = xs[i1];
      const p1y = ys[i1];
      const p2x = xs[i2];
      const p2y = ys[i2];
      const p3x = xs[i3];
      const p3y = ys[i3];
      const c1x = p1x + (p2x - p0x) / 6;
      const c1y = p1y + (p2y - p0y) / 6;
      const c2x = p2x - (p3x - p1x) / 6;
      const c2y = p2y - (p3y - p1y) / 6;
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2x, p2y);
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
    ctx.fillText(this.formatTime(tMin), 8, h - 6);
    ctx.fillText(this.formatTime(tMax), w / 2 - 20, h - 6);

    if (!this.showStats) {
      return;
    }
    const nowV = this.voltageData[n - 1];
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
    let minV = this.voltageData[0];
    let maxV = this.voltageData[0];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = this.voltageData[i];
      if (v < minV) {
        minV = v;
      }
      if (v > maxV) {
        maxV = v;
      }
      sum += v;
    }
    const avg = sum / n;
    let crossings = 0;
    let firstT = -1;
    let lastT = -1;
    const thr = avg;
    for (let i = 1; i < n; i++) {
      if (this.voltageData[i - 1] <= thr && this.voltageData[i] > thr) {
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
    return h - ((v - vMin) / range) * h;
  }

  private formatVoltage(v: number): string {
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
