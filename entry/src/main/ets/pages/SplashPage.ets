/**
 * Splash — 3D 参数化线框曲面启动页
 * 纯黑极简背景 | 左侧留白文字 | 右上霓虹线框双曲面 | 左下渐变logo
 */
import { BusinessError } from '@kit.BasicServicesKit';

interface Vec3 {
  x: number; y: number; z: number;
}

interface MeshEdge {
  a: number; b: number;
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
  @State textOpacity: number = 0;
  @State statusText: string = 'Initializing simulation kernel...';
  private meshAngle: number = 0;
  private meshScale: number = 1;
  private meshVertices: Vec3[] = [];
  private meshEdges: MeshEdge[] = [];
  private animTimer: number = -1;
  private exitTimer: number = -1;
  private canvasSettings: RenderingContextSettings = new RenderingContextSettings(true);
  private canvasCtx: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.canvasSettings);
  private canvasW: number = 1440;
  private canvasH: number = 810;
  private startTime: number = 0;

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

    // Entrance animation
    try {
      this.getUIContext()?.animateTo({ duration: 900, curve: Curve.EaseOut }, () => {
        this.textOpacity = 1;
      });
    } catch (_e) {} // fallback: property animates via @Animatable

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
    // Elliptical cutout in parameter space (z, theta)
    const cutZ = 0.85;
    const cutT = 1.05;

    const vertices: Vec3[] = [];
    // Build vertex grid [zSegs+1][tSegs]
    const grid: Vec3[][] = [];
    const keepMask: boolean[][] = [];

    for (let iz = 0; iz <= zSegs; iz++) {
      const z = -height + (2 * height * iz) / zSegs;
      const r = Math.sqrt(1 + z * z);
      const row: Vec3[] = [];
      const maskRow: boolean[] = [];
      for (let it = 0; it < tSegs; it++) {
        const theta = (2 * Math.PI * it) / tSegs;
        // Elliptical cutout: skip if inside the hole
        const zNorm = z / cutZ;
        const tNorm = (theta - Math.PI) / cutT;
        const inHole = zNorm * zNorm + tNorm * tNorm < 1.0;
        const x = a * r * Math.cos(theta + twist * z);
        const y = b * r * Math.sin(theta + twist * z);
        row.push({ x, y, z });
        maskRow.push(!inHole);
        if (!inHole) {
          vertices.push({ x, y, z });
        }
      }
      grid.push(row);
      keepMask.push(maskRow);
    }

    // Build edges from the grid
    const edges: MeshEdge[] = [];
    const edgeSet = new Set<string>();
    const vertIdx = new Map<string, number>();
    for (let i = 0; i < vertices.length; i++) {
      vertIdx.set(`${vertices[i].x.toFixed(4)},${vertices[i].y.toFixed(4)},${vertices[i].z.toFixed(4)}`, i);
    }

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
          a: i1, b: i2,
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
        // Horizontal edges
        addEdge(a0, a1);
        // Vertical edges
        addEdge(a0, b0);
        // Diagonal (upper-left to lower-right of quad)
        addEdge(a0, b1);
      }
    }

    this.meshVertices = vertices;
    this.meshEdges = edges;
  }

  private startAnimation(): void {
    const fps = 30;
    this.animTimer = setInterval(() => {
      this.meshAngle += 0.008;
      this.drawFrame();

      // Loading progress
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

    // Project vertices
    const proj: ProjPoint[] = [];
    const cosA = Math.cos(this.meshAngle);
    const sinA = Math.sin(this.meshAngle);
    const camDist = 5.5;
    // Offset mesh to upper-right quadrant of screen
    const screenCX = w * 0.68;
    const screenCY = h * 0.38;
    const projScale = Math.min(w, h) * 0.28 * this.meshScale;

    for (let i = 0; i < this.meshVertices.length; i++) {
      const v = this.meshVertices[i];
      // Rotate around Y axis
      const rx = v.x * cosA - v.z * sinA;
      const rz = v.x * sinA + v.z * cosA;
      const ry = v.y;
      const depth = rz + camDist;
      const invZ = projScale / depth;
      const pp: ProjPoint = {
        sx: rx * invZ + screenCX,
        sy: -ry * invZ + screenCY,
        depth: depth
      };
      proj.push(pp);
    }

    // Draw edges with neon glow — 3 passes
    const sortedEdges = this.meshEdges.slice();
    // Sort back-to-front for glow depth (optional, subtle effect)
    for (let pass = 0; pass < 3; pass++) {
      let lineW: number;
      let alpha: number;
      if (pass === 0) {
        lineW = 5;
        alpha = 0.06;
      } else if (pass === 1) {
        lineW = 2.2;
        alpha = 0.22;
      } else {
        lineW = 0.9;
        alpha = 0.75;
      }

      for (let e = 0; e < sortedEdges.length; e++) {
        const edge = sortedEdges[e];
        const p1 = proj[edge.a];
        const p2 = proj[edge.b];
        if (p1 === undefined || p2 === undefined) {
          continue;
        }

        // Color gradient based on z-position: cyan-green (top) → yellow (mid) → light-blue (bottom)
        const zNorm = (edge.avgZ + 2.2) / 4.4; // normalize to 0..1
        const color = this.edgeColor(zNorm, alpha);

        ctx.strokeStyle = color;
        ctx.lineWidth = lineW;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
    }
  }

  private edgeColor(t: number, alpha: number): string {
    // t: 0=bottom(blue), 0.5=mid(yellow), 1=top(cyan-green)
    let r: number, g: number, b: number;
    if (t < 0.5) {
      // blue → yellow
      const s = t * 2;
      r = Math.round(68 + s * (255 - 68));
      g = Math.round(170 + s * (238 - 170));
      b = Math.round(255 - s * 255);
    } else {
      // yellow → cyan-green
      const s = (t - 0.5) * 2;
      r = Math.round(255 - s * 255);
      g = Math.round(238 - s * (238 - 170));
      b = Math.round(s * 170);
    }
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private finish(): void {
    clearInterval(this.animTimer);
    this.animTimer = -1;

    // Fade out text
    try {
      this.getUIContext()?.animateTo({ duration: 600, curve: Curve.EaseIn }, () => {
        this.textOpacity = 0;
      });
    } catch (_e) {} // fallback: property animates via @Animatable

    // Expand mesh + fade page during exit transition
    const expandStart = Date.now();
    const expandTimer = setInterval(() => {
      const elapsed = Date.now() - expandStart;
      const progress = Math.min(elapsed / 600, 1);
      const easeIn = progress * progress;
      this.meshScale = 1 + (2.5 * easeIn);
      this.pageOpacity = 1 - progress;
      this.drawFrame();

      if (progress >= 1) {
        clearInterval(expandTimer);
        this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' })
          .catch((_err: BusinessError) => {
            // Fallback if UIContext router fails mid-transition
          });
      }
    }, 30);
  }

  build() {
    Stack() {
      // Pure black background
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#000000')

      // Full-screen 3D wireframe canvas
      Canvas(this.canvasCtx)
        .width('100%')
        .height('100%')
        .onReady(() => {
          this.drawFrame();
        })
        .onAreaChange((_old, area) => {
          this.canvasW = area.width as number;
          this.canvasH = area.height as number;
        })
        .hitTestBehavior(HitTestMode.None)

      // ===== Left-side typography =====
      Column() {
        Blank().layoutWeight(1)

        Column({ space: 0 }) {
          Text('ElecDraw')
            .fontSize(38)
            .fontWeight(FontWeight.Bold)
            .fontColor('#FFFFFF')
            .fontFamily('sans-serif')
            .letterSpacing(4)
            .opacity(this.textOpacity)

          Blank().height(10)

          Text('Hardware Schematic Simulator')
            .fontSize(14)
            .fontColor('rgba(255,255,255,0.55)')
            .fontFamily('sans-serif')
            .letterSpacing(2)
            .opacity(this.textOpacity * 0.85)

          Blank().height(36)

          Text(this.statusText)
            .fontSize(12)
            .fontColor('rgba(255,255,255,0.35)')
            .fontFamily('sans-serif')
            .opacity(this.textOpacity * 0.7)
        }
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 72 })

        Blank().layoutWeight(1.2)

        // ===== Bottom-left logo + text =====
        Row({ space: 10 }) {
          // Small gradient square logo — triple-stripe colored blocks
          Row({ space: 1.5 }) {
            Column().width(6).height(20).backgroundColor('#44DDBB').borderRadius(0)
            Column().width(6).height(20).backgroundColor('#FFEE44').borderRadius(0)
            Column().width(6).height(20).backgroundColor('#44AAFF').borderRadius(0)
          }

          Column({ space: 1 }) {
            Text('ElecDraw')
              .fontSize(11)
              .fontColor('rgba(255,255,255,0.65)')
              .fontFamily('sans-serif')
              .fontWeight(FontWeight.Medium)
            Text('v1.0.0')
              .fontSize(9)
              .fontColor('rgba(255,255,255,0.30)')
              .fontFamily('sans-serif')
          }
          .alignItems(HorizontalAlign.Start)
        }
        .padding({ left: 72, bottom: 40 })
        .opacity(this.textOpacity * 0.8)
      }
      .width('100%')
      .height('100%')
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
    .opacity(Math.max(0, this.pageOpacity))
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
