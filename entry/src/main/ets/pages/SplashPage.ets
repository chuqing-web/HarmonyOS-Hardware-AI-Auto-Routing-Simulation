/**
 * Splash — 霓虹线框双曲面启动页
 *
 * 回归说明：
 * 全 Canvas 自绘 + 严苛 ready 门闩后出现「全黑启动」：时钟在跑但线框不可见。
 * 本页回到已验证可显示的结构（初版/稳定版）：
 * - Canvas 只画霓虹网格；品牌/进度用 Text（不依赖 Canvas 字）
 * - onReady 后开钟；尺寸来自 onAreaChange（vp），缺省用合理默认值
 * - 不做深度 sort（避免异常中断帧）；清屏用 clearRect
 * - Canvas 不设 backgroundColor（黑底由后方 Column 提供）
 */
import { BusinessError } from '@kit.BasicServicesKit';
import { APP_VERSION_NAME } from 'common';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface MeshEdge {
  a: number;
  b: number;
  avgZ: number;
}

interface LoadingStage {
  atMs: number;
  text: string;
}

interface ProjPoint {
  sx: number;
  sy: number;
  depth: number;
}

@Entry
@Component
struct SplashPage {
  @State pageOpacity: number = 1;
  @State textOpacity: number = 0;
  @State statusText: string = 'Initializing simulation kernel...';
  @State progress: number = 0;
  @State versionLabel: string = `v${APP_VERSION_NAME}`;

  private meshAngle: number = 0;
  private meshScale: number = 0.92;
  private meshBreath: number = 0;
  private meshDrawAlpha: number = 1;
  private meshVertices: Vec3[] = [];
  private meshEdges: MeshEdge[] = [];
  private projBuf: ProjPoint[] = [];

  private animTimer: number = -1;
  private exitTimer: number = -1;
  private canvasSettings: RenderingContextSettings = new RenderingContextSettings(true);
  private canvasCtx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.canvasSettings);
  /** 缺省非 0：避免 onAreaChange 迟到时整段空画 */
  private canvasW: number = 1280;
  private canvasH: number = 800;
  private startTime: number = 0;
  private entering: boolean = true;
  private exiting: boolean = false;
  private navigated: boolean = false;
  private animStarted: boolean = false;
  private contextReady: boolean = false;

  private readonly TOTAL_MS: number = 2800;
  private readonly EXIT_MS: number = 520;

  private readonly stages: LoadingStage[] = [
    { atMs: 0, text: 'Initializing simulation kernel...' },
    { atMs: 550, text: 'Loading component library...' },
    { atMs: 1100, text: 'Configuring AI routing engine...' },
    { atMs: 1750, text: 'Preparing schematic workspace...' },
    { atMs: 2500, text: 'Ready' }
  ];

  aboutToAppear(): void {
    this.generateMesh();
    try {
      this.getUIContext().animateTo({ duration: 900, curve: Curve.EaseOut }, () => {
        this.textOpacity = 1;
      });
    } catch (_e) {
      this.textOpacity = 1;
    }
    // onReady 可能已先到；再兜底一次
    setTimeout(() => {
      this.tryStartAnimation();
      this.drawFrame();
    }, 120);
    setTimeout(() => {
      this.tryStartAnimation();
      this.drawFrame();
    }, 400);
  }

  aboutToDisappear(): void {
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.animTimer >= 0) {
      clearInterval(this.animTimer);
      this.animTimer = -1;
    }
    if (this.exitTimer >= 0) {
      clearInterval(this.exitTimer);
      this.exitTimer = -1;
    }
  }

  private tryStartAnimation(): void {
    if (this.animStarted || this.navigated || !this.contextReady) {
      return;
    }
    if (this.canvasW <= 1 || this.canvasH <= 1) {
      return;
    }
    this.animStarted = true;
    this.startTime = Date.now();
    this.startAnimation();
  }

  private generateMesh(): void {
    const zSegs = 22;
    const tSegs = 36;
    const height = 2.2;
    const twist = 1.6;
    const a = 1.0;
    const b = 0.65;
    const cutZ = 0.85;
    const cutT = 1.05;

    const vertices: Vec3[] = [];
    const keepMask: boolean[][] = [];

    for (let iz = 0; iz <= zSegs; iz++) {
      const z = -height + (2 * height * iz) / zSegs;
      const r = Math.sqrt(1 + z * z);
      const maskRow: boolean[] = [];
      for (let it = 0; it < tSegs; it++) {
        const theta = (2 * Math.PI * it) / tSegs;
        const zNorm = z / cutZ;
        const tNorm = (theta - Math.PI) / cutT;
        const inHole = zNorm * zNorm + tNorm * tNorm < 1.0;
        const x = a * r * Math.cos(theta + twist * z);
        const y = b * r * Math.sin(theta + twist * z);
        maskRow.push(!inHole);
        if (!inHole) {
          vertices.push({ x, y, z });
        }
      }
      keepMask.push(maskRow);
    }

    const edges: MeshEdge[] = [];
    const edgeSet = new Set<string>();

    let vi = 0;
    const idxGrid: number[][] = [];
    for (let iz = 0; iz <= zSegs; iz++) {
      const row: number[] = [];
      for (let it = 0; it < tSegs; it++) {
        if (keepMask[iz][it]) {
          row.push(vi);
          vi++;
        } else {
          row.push(-1);
        }
      }
      idxGrid.push(row);
    }

    const addEdge = (i1: number, i2: number): void => {
      if (i1 < 0 || i2 < 0) {
        return;
      }
      const key = i1 < i2 ? `${i1},${i2}` : `${i2},${i1}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({
          a: i1,
          b: i2,
          avgZ: (vertices[i1].z + vertices[i2].z) / 2
        });
      }
    };

    for (let iz = 0; iz < zSegs; iz++) {
      for (let it = 0; it < tSegs; it++) {
        const itNext = (it + 1) % tSegs;
        const a0 = idxGrid[iz][it];
        const a1 = idxGrid[iz][itNext];
        const b0 = idxGrid[iz + 1][it];
        const b1 = idxGrid[iz + 1][itNext];
        addEdge(a0, a1);
        addEdge(a0, b0);
        addEdge(a0, b1);
      }
    }

    this.meshVertices = vertices;
    this.meshEdges = edges;
    this.projBuf = [];
    for (let i = 0; i < vertices.length; i++) {
      this.projBuf.push({ sx: 0, sy: 0, depth: 0 });
    }
  }

  private startAnimation(): void {
    let lastProgressShown: number = -1;
    this.animTimer = setInterval(() => {
      this.meshAngle += 0.012;
      this.meshBreath += 0.045;

      if (this.entering && !this.exiting) {
        const enterT = Math.min((Date.now() - this.startTime) / 900, 1);
        const ease = 1 - Math.pow(1 - enterT, 2.4);
        this.meshScale = 0.92 + 0.08 * ease;
        if (enterT >= 1) {
          this.entering = false;
        }
      }

      // 先画网格，再更新 @State（避免重建清缓冲抢在描边前）
      this.drawFrame();

      if (this.exiting) {
        return;
      }

      const elapsed = Date.now() - this.startTime;
      const pct = Math.min(100, Math.floor(elapsed / this.TOTAL_MS * 100));
      // 进度/文案少改 @State，防止频繁 rebuild 把 Canvas 刷黑
      if (pct !== lastProgressShown) {
        lastProgressShown = pct;
        this.progress = pct;
      }

      for (let i = this.stages.length - 1; i >= 0; i--) {
        if (elapsed >= this.stages[i].atMs) {
          if (this.statusText !== this.stages[i].text) {
            this.statusText = this.stages[i].text;
          }
          break;
        }
      }

      if (elapsed >= this.TOTAL_MS) {
        this.beginExit();
      }
    }, 33);
  }

  private syncCanvasSizeFromContext(): void {
    try {
      const cw = Number(this.canvasCtx.width);
      const ch = Number(this.canvasCtx.height);
      if (cw > 1 && ch > 1) {
        this.canvasW = cw;
        this.canvasH = ch;
      }
    } catch (_e) {
      // ignore
    }
  }

  private drawFrame(): void {
    if (!this.contextReady) {
      return;
    }
    this.syncCanvasSizeFromContext();
    const ctx = this.canvasCtx;
    const w = this.canvasW;
    const h = this.canvasH;
    if (w <= 1 || h <= 1) {
      return;
    }
    if (this.meshVertices.length === 0 || this.meshEdges.length === 0) {
      return;
    }

    try {
      ctx.clearRect(0, 0, w, h);
    } catch (_eClear) {
      return;
    }

    const breath = 1 + 0.02 * Math.sin(this.meshBreath);
    const cosA = Math.cos(this.meshAngle);
    const sinA = Math.sin(this.meshAngle);
    const camDist = 5.5;
    // 偏右上：与初版构图一致，避免被左侧文案挡住观感
    const screenCX = w * 0.62;
    const screenCY = h * 0.36;
    const projScale = Math.min(w, h) * 0.26 * this.meshScale * breath;
    const globalA = this.meshDrawAlpha;

    for (let i = 0; i < this.meshVertices.length; i++) {
      const v = this.meshVertices[i];
      const rx = v.x * cosA - v.z * sinA;
      const rz = v.x * sinA + v.z * cosA;
      const ry = v.y;
      const depth = rz + camDist;
      const invZ = projScale / depth;
      const pp = this.projBuf[i];
      pp.sx = rx * invZ + screenCX;
      pp.sy = -ry * invZ + screenCY;
      pp.depth = depth;
    }

    // 三遍描边：外晕 → 中晕 → 核心（提高透明度，避免“全黑感”）
    for (let pass = 0; pass < 3; pass++) {
      let baseW: number;
      let baseA: number;
      if (pass === 0) {
        baseW = 5.0;
        baseA = 0.08;
      } else if (pass === 1) {
        baseW = 2.2;
        baseA = 0.28;
      } else {
        baseW = 1.0;
        baseA = 0.85;
      }

      for (let e = 0; e < this.meshEdges.length; e++) {
        const edge = this.meshEdges[e];
        const p1 = this.projBuf[edge.a];
        const p2 = this.projBuf[edge.b];
        if (p1 === undefined || p2 === undefined) {
          continue;
        }
        const zNorm = (edge.avgZ + 2.2) / 4.4;
        ctx.strokeStyle = this.edgeColor(zNorm, baseA * globalA);
        ctx.lineWidth = baseW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }
  }

  private edgeColor(t: number, alpha: number): string {
    let r: number;
    let g: number;
    let b: number;
    if (t < 0.5) {
      const s = t * 2;
      r = Math.round(68 + s * (255 - 68));
      g = Math.round(170 + s * (238 - 170));
      b = Math.round(255 - s * 255);
    } else {
      const s = (t - 0.5) * 2;
      r = Math.round(255 - s * 255);
      g = Math.round(238 - s * (238 - 170));
      b = Math.round(s * 170);
    }
    const aa = Math.max(0.05, Math.min(1, alpha));
    return `rgba(${r},${g},${b},${aa})`;
  }

  private beginExit(): void {
    if (this.exiting || this.navigated) {
      return;
    }
    this.exiting = true;
    if (this.animTimer >= 0) {
      clearInterval(this.animTimer);
      this.animTimer = -1;
    }

    try {
      this.getUIContext().animateTo({ duration: 420, curve: Curve.EaseIn }, () => {
        this.textOpacity = 0;
      });
    } catch (_e) {
      this.textOpacity = 0;
    }

    const expandStart = Date.now();
    const baseScale = this.meshScale;
    this.exitTimer = setInterval(() => {
      const elapsed = Date.now() - expandStart;
      const t = Math.min(elapsed / this.EXIT_MS, 1);
      const easeIn = t * t;
      this.meshScale = baseScale + 0.35 * easeIn;
      this.meshDrawAlpha = 1 - t;
      this.pageOpacity = Math.max(0, 1 - t);
      this.drawFrame();

      if (t >= 1) {
        clearInterval(this.exitTimer);
        this.exitTimer = -1;
        this.navigateToHome();
      }
    }, 30);
  }

  private navigateToHome(): void {
    if (this.navigated) {
      return;
    }
    this.navigated = true;
    this.clearTimers();
    try {
      this.getUIContext().getRouter().replaceUrl({ url: 'pages/HomePage' })
        .catch((_err: BusinessError) => {
          this.navigated = false;
          setTimeout(() => {
            if (!this.navigated) {
              this.navigated = true;
              try {
                this.getUIContext().getRouter().replaceUrl({ url: 'pages/HomePage' });
              } catch (_e2) {
                // ignore
              }
            }
          }, 160);
        });
    } catch (_e) {
      this.navigated = false;
    }
  }

  build() {
    Stack() {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#000000')

      Canvas(this.canvasCtx)
        .width('100%')
        .height('100%')
        .hitTestBehavior(HitTestMode.None)
        .onReady(() => {
          this.contextReady = true;
          this.syncCanvasSizeFromContext();
          this.tryStartAnimation();
          this.drawFrame();
        })
        .onAreaChange((_old, area) => {
          const w = Number(area.width);
          const h = Number(area.height);
          if (w > 1 && h > 1) {
            this.canvasW = w;
            this.canvasH = h;
            if (this.contextReady) {
              this.tryStartAnimation();
              this.drawFrame();
            }
          }
        })

      // 左侧文案：不依赖 Canvas 文字，保证启动页绝不是“纯黑一片”
      Column() {
        Blank().layoutWeight(1)

        Column({ space: 0 }) {
          Text('ElecDraw')
            .fontSize(38)
            .fontWeight(FontWeight.Bold)
            .fontColor('#FFFFFF')
            .letterSpacing(4)
            .opacity(this.textOpacity)

          Blank().height(10)

          Text('Hardware Schematic Simulator')
            .fontSize(14)
            .fontColor('rgba(255,255,255,0.55)')
            .letterSpacing(2)
            .opacity(this.textOpacity * 0.85)

          Blank().height(28)

          // 进度条
          Row() {
            Row()
              .width(`${Math.max(4, this.progress)}%`)
              .height(2)
              .backgroundColor('rgba(120,210,255,0.85)')
          }
          .width(220)
          .height(2)
          .backgroundColor('rgba(255,255,255,0.12)')
          .opacity(this.textOpacity)

          Blank().height(14)

          Text(this.statusText)
            .fontSize(12)
            .fontColor('rgba(255,255,255,0.40)')
            .opacity(this.textOpacity * 0.85)
        }
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 72 })

        Blank().layoutWeight(1.15)

        Row({ space: 10 }) {
          Row({ space: 1.5 }) {
            Column().width(6).height(20).backgroundColor('#44DDBB')
            Column().width(6).height(20).backgroundColor('#FFEE44')
            Column().width(6).height(20).backgroundColor('#44AAFF')
          }

          Column({ space: 1 }) {
            Text('ElecDraw')
              .fontSize(11)
              .fontColor('rgba(255,255,255,0.65)')
              .fontWeight(FontWeight.Medium)
            Text(this.versionLabel)
              .fontSize(9)
              .fontColor('rgba(255,255,255,0.30)')
          }
          .alignItems(HorizontalAlign.Start)
        }
        .padding({ left: 72, bottom: 40 })
        .opacity(this.textOpacity * 0.85)
      }
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#000000')
    .opacity(Math.max(0, this.pageOpacity))
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
