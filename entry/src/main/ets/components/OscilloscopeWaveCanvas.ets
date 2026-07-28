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
  /**
   * 频域（FFT）：横轴为 Hz，必须按全频谱窗显示；
   * 禁止再按 tPerDiv（秒）裁窗，否则只剩 DC 附近一条竖线/空白。
   */
  @Prop @Watch('onDataChanged') freqDomain: boolean = false;
  @Prop canvasHeight: number = 160;
  @Prop showStats: boolean = true;
  /**
   * 水平缩放：1=默认窗宽(cols×tPerDiv)；>1 放大（窗更窄）；<1 缩小。
   * 侧栏默认 1；放大弹窗可交互调节。
   */
  @Prop @Watch('onDataChanged') viewZoom: number = 1;
  /**
   * 相对最新时刻的回看秒数：0=跟随滚动到最新；增大则向历史拖动。
   */
  @Prop @Watch('onDataChanged') viewPanSec: number = 0;
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

    const win = this.resolveTimeWindow(n);
    const scale = this.computeScale(n, win.i0, win.i1, win.tMin, win.tMax);
    this.drawZeroLine(ctx, w, h, scale.vMin, scale.vMax);
    this.drawTrigger(ctx, w, h, scale.vMin, scale.vMax);
    this.drawTrace(ctx, w, h, n, win.i0, win.i1, win.tMin, win.tMax, scale.vMin, scale.vMax);
    this.drawHudHeaders(ctx, w, h, n, win.i0, win.i1, scale.vMin, scale.vMax, scale.tMin, scale.tMax);
  }

  /**
   * 滚动窗：固定时基宽度。
   * A) 有效历史不足一屏 → 左缘对齐首个有效样点（迹线从左往右写，右侧可空）
   * B) 历史已满 → 最新时刻贴右缘（CRT 滚动）
   * 频域：横轴为 Hz，默认铺满 0～Nyquist（可用 viewZoom 放大）。
   */
  private resolveTimeWindow(n: number): TimeViewWindow {
    // 用「有限电压」样点界定真实可见历史，忽略引擎填充的 NaN 空洞
    let tFirst = Number.NaN;
    let tLast = Number.NaN;
    for (let i = 0; i < n; i++) {
      const t = this.timeData[i];
      const v = this.voltageData[i];
      if (Number.isFinite(t) && Number.isFinite(v)) {
        tFirst = t;
        break;
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      const t = this.timeData[i];
      const v = this.voltageData[i];
      if (Number.isFinite(t) && Number.isFinite(v)) {
        tLast = t;
        break;
      }
    }
    if (!Number.isFinite(tFirst) || !Number.isFinite(tLast)) {
      tFirst = Number.isFinite(this.timeData[0]) ? this.timeData[0] : 0;
      tLast = Number.isFinite(this.timeData[n - 1]) ? this.timeData[n - 1] : tFirst;
    }

    const zoom = Math.max(this.viewZoom, 0.05);
    const availableSpan = Math.max(tLast - tFirst, 0);
    let span: number;
    if (this.freqDomain) {
      // FFT：以全频谱为基准窗，禁止用秒时基裁切
      span = Math.max(availableSpan, 1) / zoom;
    } else {
      span = Math.max(this.tPerDiv * this.cols, 1e-12) / zoom;
    }
    const pan = Math.max(this.viewPanSec, 0);

    let tMin: number;
    let tMax: number;
    if (this.freqDomain) {
      tMin = tFirst;
      tMax = tFirst + span;
      if (tMax < tLast && zoom <= 1.0001) {
        tMax = tLast;
      }
      if (pan > 1e-15) {
        tMin = Math.min(tFirst + pan, Math.max(tLast - span, tFirst));
        tMax = tMin + span;
      }
    } else if (availableSpan < span - 1e-15 && pan <= 1e-15) {
      // 写屏阶段：从左填充
      tMin = tFirst;
      tMax = tFirst + span;
    } else {
      // 滚动阶段：右缘对齐最新（可回看）
      tMax = tLast - pan;
      if (tMax < tFirst) {
        tMax = tFirst;
      }
      if (tMax > tLast) {
        tMax = tLast;
      }
      tMin = tMax - span;
      // 回看时若越过首样，钳到首样并保持窗宽观感
      if (tMin < tFirst && pan > 1e-15) {
        tMin = tFirst;
        tMax = tMin + span;
      }
    }

    let i0 = 0;
    let i1 = n - 1;
    for (let i = 0; i < n; i++) {
      const t = this.timeData[i];
      if (Number.isFinite(t) && t >= tMin) {
        i0 = i > 0 ? i - 1 : 0;
        break;
      }
    }
    for (let i = n - 1; i >= 0; i--) {
      const t = this.timeData[i];
      if (Number.isFinite(t) && t <= tMax) {
        i1 = i < n - 1 ? i + 1 : n - 1;
        break;
      }
    }
    if (i1 <= i0) {
      i0 = Math.max(0, n - 2);
      i1 = n - 1;
    }
    return { i0: i0, i1: i1, tMin: tMin, tMax: tMax };
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
    ctx.font = 'bold 16px monospace';
    ctx.fillText(this.channelLabel, 8, 22);

    ctx.fillStyle = '#6b7a99';
    ctx.font = '18px monospace';
    ctx.fillText('NO SIGNAL', w / 2 - 52, h / 2 - 8);
    ctx.font = '14px monospace';
    if (this.channelLabel.indexOf('CH') === 0) {
      ctx.fillText('放置并连接示波器后运行仿真', Math.max(8, w / 2 - 140), h / 2 + 18);
    } else {
      ctx.fillText('运行仿真后自动刷新', Math.max(8, w / 2 - 90), h / 2 + 18);
    }
  }

  private computeScale(n: number, i0: number, i1: number, tMin: number, tMax: number): ScaleWindow {
    const rows = this.rows;
    const vDiv = Math.max(this.vPerDiv, 1e-6);

    let dataMin = Number.POSITIVE_INFINITY;
    let dataMax = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i0);
    const hi = Math.min(n - 1, i1);
    for (let i = lo; i <= hi; i++) {
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

    return {
      vMin: vMin,
      vMax: vMax,
      tMin: tMin,
      tMax: tMax
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
    ctx.font = '13px monospace';
    ctx.fillText('0V', 4, y - 4);
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
    ctx.font = '13px monospace';
    ctx.fillText(`T ${this.formatVoltage(this.triggerLevel)}`, Math.max(8, w - 88), y - 4);
  }

  /**
   * 按时间窗映射 X（滚动显示）；窗内过密时按像素桶输出 min/max 包络，保留尖峰。
   */
  private drawTrace(ctx: CanvasRenderingContext2D, w: number, h: number, n: number,
    i0: number, i1: number, tMin: number, tMax: number,
    vMin: number, vMax: number): void {
    const xs: number[] = [];
    const ys: number[] = [];
    const lo = Math.max(0, i0);
    const hi = Math.min(n - 1, i1);
    const count = hi - lo + 1;
    const tSpan = Math.max(tMax - tMin, 1e-15);

    if (count <= Math.floor(w) + 2) {
      for (let i = lo; i <= hi; i++) {
        const v = this.voltageData[i];
        const t = this.timeData[i];
        if (!Number.isFinite(v) || !Number.isFinite(t)) {
          continue;
        }
        const x = ((t - tMin) / tSpan) * w;
        xs.push(x);
        ys.push(this.voltageToY(v, h, vMin, vMax));
      }
    } else {
      // 每像素一桶：按时间顺序输出 min/max，避免中点抽样丢掉窄脉冲
      const buckets = Math.max(Math.floor(w), 64);
      for (let b = 0; b < buckets; b++) {
        const iStart = lo + Math.floor((b / buckets) * count);
        const iEnd = lo + Math.min(count, Math.floor(((b + 1) / buckets) * count));
        if (iEnd <= iStart) {
          continue;
        }
        let iMin = -1;
        let iMax = -1;
        let vmin = Number.POSITIVE_INFINITY;
        let vmax = Number.NEGATIVE_INFINITY;
        for (let i = iStart; i < iEnd; i++) {
          const v = this.voltageData[i];
          const t = this.timeData[i];
          if (!Number.isFinite(v) || !Number.isFinite(t)) {
            continue;
          }
          if (v < vmin) {
            vmin = v;
            iMin = i;
          }
          if (v > vmax) {
            vmax = v;
            iMax = i;
          }
        }
        if (iMin < 0 || iMax < 0) {
          continue;
        }
        const pushPt = (idx: number): void => {
          const v = this.voltageData[idx];
          const t = this.timeData[idx];
          const x = ((t - tMin) / tSpan) * w;
          xs.push(x);
          ys.push(this.voltageToY(v, h, vMin, vMax));
        };
        if (iMin === iMax) {
          pushPt(iMin);
        } else if (iMin < iMax) {
          pushPt(iMin);
          pushPt(iMax);
        } else {
          pushPt(iMax);
          pushPt(iMin);
        }
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
    if (xs.length < 2) {
      return;
    }
    // 跳过写屏 NaN 造成的大间隙，避免把左缘迹线错误连到右缘
    const gapX = Math.max(this.canvasW * 0.08, 12);
    ctx.beginPath();
    let penDown = false;
    let prevX = xs[0];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const y = ys[i];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        penDown = false;
        continue;
      }
      if (!penDown || Math.abs(x - prevX) > gapX) {
        ctx.moveTo(x, y);
        penDown = true;
      } else {
        ctx.lineTo(x, y);
      }
      prevX = x;
    }
    ctx.stroke();
  }

  private drawHudHeaders(ctx: CanvasRenderingContext2D, w: number, h: number, n: number,
    i0: number, i1: number, vMin: number, vMax: number, tMin: number, tMax: number): void {
    const stats = this.computeStats(n, i0, i1);
    ctx.fillStyle = this.waveColor;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(this.channelLabel, 8, 20);

    ctx.fillStyle = '#8fa0bf';
    ctx.font = '13px monospace';
    if (this.freqDomain) {
      ctx.fillText(`${this.formatMag(vMax)}`, Math.max(8, w - 72), 16);
      ctx.fillText(`${this.formatMag(vMin)}`, Math.max(8, w - 72), h - 8);
    } else {
      ctx.fillText(`${this.formatVoltage(vMax)}`, Math.max(8, w - 72), 16);
      ctx.fillText(`${this.formatVoltage(vMin)}`, Math.max(8, w - 72), h - 8);
    }
    // 横轴：时域=秒窗；频域=Hz 窗（/div 跟当前可视窗，含缩放）
    const span = Math.max(tMax - tMin, 0);
    const effectivePerDiv = span / this.cols;
    ctx.fillText(this.freqDomain ? this.formatFreq(tMin) : '0', 8, h - 8);
    ctx.fillText(this.freqDomain ? this.formatFreq(tMin + span / 2) : this.formatTime(span),
      w / 2 - 28, h - 8);
    ctx.fillText(
      this.freqDomain ? `${this.formatFreq(effectivePerDiv)}/div` : `${this.formatTime(effectivePerDiv)}/div`,
      Math.max(8, w - 88), h - 8);

    if (!this.showStats) {
      return;
    }
    const hi = Math.min(n - 1, i1);
    let nowV = this.voltageData[hi];
    if (!Number.isFinite(nowV)) {
      nowV = stats.avg;
    }
    let peakF = 0;
    let peakMag = Number.NEGATIVE_INFINITY;
    if (this.freqDomain) {
      const lo = Math.max(0, i0);
      for (let i = lo; i <= hi; i++) {
        const mag = this.voltageData[i];
        const f = this.timeData[i];
        if (!Number.isFinite(mag) || !Number.isFinite(f) || f <= 0) {
          continue;
        }
        if (mag > peakMag) {
          peakMag = mag;
          peakF = f;
        }
      }
    }
    const follow = this.viewPanSec <= 1e-12 ? 'ROLL' : 'PAN';
    const line = this.freqDomain
      ? `Peak ${this.formatFreq(peakF)}  Mag ${this.formatMag(peakMag)}  ` +
        `span ${this.formatFreq(span)}  ×${this.viewZoom.toFixed(1)}`
      : `Vpp ${this.formatVoltage(stats.vpp)}  ` +
        `Avg ${this.formatVoltage(stats.avg)}  ` +
        `f ${this.formatFreq(stats.freq)}  ` +
        `now ${this.formatVoltage(nowV)}  ${follow} ×${this.viewZoom.toFixed(1)}`;
    ctx.fillStyle = '#c8d4ea';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(line, 8, 42);

    ctx.fillStyle = '#6b7a99';
    ctx.font = '13px monospace';
    ctx.fillText(
      this.freqDomain ? `${this.formatMag(this.vPerDiv)}/div` : `${this.formatVoltage(this.vPerDiv)}/div`,
      Math.max(8, w - 80), 40);
  }

  private formatMag(v: number): string {
    if (!Number.isFinite(v)) {
      return '--';
    }
    const a = Math.abs(v);
    if (a >= 100) {
      return `${v.toFixed(0)}`;
    }
    if (a >= 1) {
      return `${v.toFixed(2)}`;
    }
    if (a >= 0.001) {
      return `${(v * 1000).toFixed(1)}m`;
    }
    return `${v.toFixed(3)}`;
  }

  private computeStats(n: number, i0: number, i1: number): WaveStats {
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i0);
    const hi = Math.min(n - 1, i1);
    for (let i = lo; i <= hi; i++) {
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
    for (let i = lo + 1; i <= hi; i++) {
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
    if (!Number.isFinite(f) || f < 0) {
      return '--';
    }
    if (f === 0) {
      return '0Hz';
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

interface TimeViewWindow {
  i0: number;
  i1: number;
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
