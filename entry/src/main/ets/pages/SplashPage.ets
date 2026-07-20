/**
 * Splash — 极简中心式霓虹线框双曲面启动页
 * 纯黑底 | 居中双曲面（景深+光晕+呼吸）| 下方品牌/状态 | 克制入场/退场
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
  threshold: number;
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
  @State titleOpacity: number = 0;
  @State subOpacity: number = 0;
  @State statusOpacity: number = 0;
  @State statusText: string = 'Initializing simulation kernel...';
  private meshAngle: number = 0;
  private meshScale: number = 0.88;
  private meshBreath: number = 0;
  private meshVertices: Vec3[] = [];
  private meshEdges: MeshEdge[] = [];
  private animTimer: number = -1;
  private exitTimer: number = -1;
  private canvasSettings: RenderingContextSettings = new RenderingContextSettings(true);
  private canvasCtx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.canvasSettings);
  private canvasW: number = 0;
  private canvasH: number = 0;
  private startTime: number = 0;
  private entering: boolean = true;
  private exiting: boolean = false;

  private readonly stages: LoadingStage[] = [
    { threshold: 0, text: 'Initializing simulation kernel...' },
    { threshold: 25, text: 'Loading component library...' },
    { threshold: 50, text: 'Configuring AI routing engine...' },
    { threshold: 75, text: 'Preparing schematic workspace...' },
    { threshold: 95, text: 'Ready' }
  ];

  aboutToAppear(): void {
    this.startTime = Date.now();
    this.generateMesh();
    this.startEntrance();
    this.startAnimation();
  }

  aboutToDisappear(): void {
    if (this.animTimer >= 0) {
      clearInterval(this.animTimer);
      this.animTimer = -1;
    }
    if (this.exitTimer >= 0) {
      clearTimeout(this.exitTimer);
      this.exitTimer = -1;
    }
  }

  /** 字标分阶淡入：标题 → 副标题 → 状态 */
  private startEntrance(): void {
    try {
      const ui = this.getUIContext();
      ui?.animateTo({ duration: 700, curve: Curve.EaseOut, delay: 120 }, () => {
        this.titleOpacity = 1;
      });
      ui?.animateTo({ duration: 650, curve: Curve.EaseOut, delay: 320 }, () => {
        this.subOpacity = 1;
      });
      ui?.animateTo({ duration: 600, curve: Curve.EaseOut, delay: 480 }, () => {
        this.statusOpacity = 1;
      });
    } catch (_e) {
      this.titleOpacity = 1;
      this.subOpacity = 1;
      this.statusOpacity = 1;
    }
  }

  /**
   * Generate a twisted hyperboloid wireframe mesh with elliptical center cutout.
   * Parametric surface: x² + y² - z² = 1 with twist along z-axis.
   */
  private generateMesh(): void {
    const zSegs = 28;
    const tSegs = 44;
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
  }

  private startAnimation(): void {
    const fps = 30;
    this.animTimer = setInterval(() => {
      this.meshAngle += 0.012;
      this.meshBreath += 0.045;

      // 入场：0.88 → 1.0（ease-out）
      if (this.entering && !this.exiting) {
        const enterT = Math.min((Date.now() - this.startTime) / 900, 1);
        const ease = 1 - Math.pow(1 - enterT, 2.4);
        this.meshScale = 0.88 + 0.12 * ease;
        if (enterT >= 1) {
          this.entering = false;
        }
      }

      this.drawFrame();

      if (this.exiting) {
        return;
      }

      const elapsed = Date.now() - this.startTime;
      const totalDuration = 3200;
      const ratio = Math.min(elapsed / totalDuration, 1);
      const pct = Math.floor(ratio * 100);
      for (let i = this.stages.length - 1; i >= 0; i--) {
        if (pct >= this.stages[i].threshold) {
          this.statusText = this.stages[i].text;
          break;
        }
      }

      if (ratio >= 1) {
        this.finish();
      }
    }, 1000 / fps);
  }

  private drawFrame(): void {
    const ctx = this.canvasCtx;
    const w = this.canvasW;
    const h = this.canvasH;
    if (w <= 0 || h <= 0) {
      return;
    }

    ctx.clearRect(0, 0, w, h);

    const breath = 1 + 0.02 * Math.sin(this.meshBreath);
    const cosA = Math.cos(this.meshAngle);
    const sinA = Math.sin(this.meshAngle);
    const camDist = 5.5;
    // 动态区：水平居中、上半屏；与下方静态文案分区，避免叠在一起
    const screenCX = w * 0.50;
    const screenCY = h * 0.30;
    const projScale = Math.min(w, h) * 0.18 * this.meshScale * breath;

    const proj: ProjPoint[] = [];
    let minDepth = 1e9;
    let maxDepth = -1e9;

    for (let i = 0; i < this.meshVertices.length; i++) {
      const v = this.meshVertices[i];
      const rx = v.x * cosA - v.z * sinA;
      const rz = v.x * sinA + v.z * cosA;
      const ry = v.y;
      const depth = rz + camDist;
      if (depth < minDepth) {
        minDepth = depth;
      }
      if (depth > maxDepth) {
        maxDepth = depth;
      }
      const invZ = projScale / depth;
      const pp: ProjPoint = {
        sx: rx * invZ + screenCX,
        sy: -ry * invZ + screenCY,
        depth: depth
      };
      proj.push(pp);
    }

    const depthSpan = Math.max(0.001, maxDepth - minDepth);

    // 近→远排序，景深叠绘更干净
    const sortedEdges = this.meshEdges.slice();
    sortedEdges.sort((ea: MeshEdge, eb: MeshEdge) => {
      const dA = (proj[ea.a].depth + proj[ea.b].depth) * 0.5;
      const dB = (proj[eb.a].depth + proj[eb.b].depth) * 0.5;
      return dB - dA;
    });

    // 三层霓虹（克制）：外晕淡、中晕轻、内芯不过曝
    for (let pass = 0; pass < 3; pass++) {
      let baseW: number;
      let baseA: number;
      if (pass === 0) {
        baseW = 3.8;
        baseA = 0.028;
      } else if (pass === 1) {
        baseW = 1.6;
        baseA = 0.10;
      } else {
        baseW = 0.75;
        baseA = 0.52;
      }

      for (let e = 0; e < sortedEdges.length; e++) {
        const edge = sortedEdges[e];
        const p1 = proj[edge.a];
        const p2 = proj[edge.b];
        if (p1 === undefined || p2 === undefined) {
          continue;
        }

        const edgeDepth = (p1.depth + p2.depth) * 0.5;
        // 近亮远淡（0 近 → 1 远），对比放缓避免全屏发白
        const far = (edgeDepth - minDepth) / depthSpan;
        const depthFade = 1.0 - far * 0.55;
        const widthBoost = 1.0 + (1.0 - far) * 0.18;

        const zNorm = (edge.avgZ + 2.2) / 4.4;
        const color = this.edgeColor(zNorm, baseA * depthFade);

        ctx.strokeStyle = color;
        ctx.lineWidth = baseW * widthBoost;
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
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  private finish(): void {
    if (this.exiting) {
      return;
    }
    this.exiting = true;
    if (this.animTimer >= 0) {
      clearInterval(this.animTimer);
      this.animTimer = -1;
    }

    try {
      this.getUIContext()?.animateTo({ duration: 480, curve: Curve.EaseIn }, () => {
        this.titleOpacity = 0;
        this.subOpacity = 0;
        this.statusOpacity = 0;
      });
    } catch (_e) {
      this.titleOpacity = 0;
      this.subOpacity = 0;
      this.statusOpacity = 0;
    }

    // 克制退场：轻微放大 + 整页淡出（不做炸开）
    const expandStart = Date.now();
    const baseScale = this.meshScale;
    this.exitTimer = setInterval(() => {
      const elapsed = Date.now() - expandStart;
      const progress = Math.min(elapsed / 550, 1);
      const easeIn = progress * progress;
      this.meshScale = baseScale + 0.12 * easeIn;
      this.pageOpacity = 1 - progress;
      this.drawFrame();

      if (progress >= 1) {
        clearInterval(this.exitTimer);
        this.exitTimer = -1;
        this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' })
          .catch((_err: BusinessError) => {
            // Fallback if UIContext router fails mid-transition
          });
      }
    }, 30);
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
        .onReady(() => {
          this.drawFrame();
        })
        .onAreaChange((_old, area) => {
          const nw = Number(area.width);
          const nh = Number(area.height);
          if (nw > 1 && nh > 1) {
            this.canvasW = nw;
            this.canvasH = nh;
            this.drawFrame();
          }
        })
        .hitTestBehavior(HitTestMode.None)

      // 静态文案固定下半区；上方留给动态曲面，互不叠压
      Column() {
        Blank().layoutWeight(1.75)

        Column({ space: 0 }) {
          Text('ElecDraw')
            .fontSize(34)
            .fontWeight(FontWeight.Bold)
            .fontColor('#FFFFFF')
            .fontFamily('sans-serif')
            .letterSpacing(5)
            .opacity(this.titleOpacity)

          Blank().height(10)

          Text('Hardware Schematic Simulator')
            .fontSize(13)
            .fontColor('rgba(255,255,255,0.42)')
            .fontFamily('sans-serif')
            .letterSpacing(2.5)
            .opacity(this.subOpacity)

          Blank().height(24)

          Text(this.statusText)
            .fontSize(12)
            .fontColor('rgba(255,255,255,0.28)')
            .fontFamily('sans-serif')
            .opacity(this.statusOpacity)

          Blank().height(14)

          Text(`v${APP_VERSION_NAME}`)
            .fontSize(10)
            .fontColor('rgba(255,255,255,0.20)')
            .fontFamily('sans-serif')
            .letterSpacing(1)
            .opacity(this.statusOpacity * 0.9)
        }
        .alignItems(HorizontalAlign.Center)
        .width('100%')

        Blank().layoutWeight(0.55)
      }
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.Center)
    }
    .width('100%')
    .height('100%')
    .opacity(Math.max(0, this.pageOpacity))
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
