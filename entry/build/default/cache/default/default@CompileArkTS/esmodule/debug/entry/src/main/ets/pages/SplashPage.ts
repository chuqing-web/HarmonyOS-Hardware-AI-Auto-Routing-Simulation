if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface SplashPage_Params {
    meshAngle?: number;
    meshScale?: number;
    meshBreath?: number;
    meshDrawAlpha?: number;
    brandAlpha?: number;
    meshVertices?: Vec3[];
    meshEdges?: MeshEdge[];
    projBuf?: ProjPoint[];
    sortOrder?: number[];
    edgeDepthBuf?: number[];
    animTimer?: number;
    exitTimer?: number;
    settleTimers?: number[];
    canvasSettings?: RenderingContextSettings;
    canvasCtx?: CanvasRenderingContext2D;
    canvasW?: number;
    canvasH?: number;
    startTime?: number;
    entering?: boolean;
    exiting?: boolean;
    navigated?: boolean;
    surfaceReady?: boolean;
    animStarted?: boolean;
    frameCount?: number;
    statusText?: string;
    progress?: number;
    lastStageIdx?: number;
    TOTAL_MS?: number;
    EXIT_MS?: number;
    stages?: LoadingStage[];
}
import type { BusinessError } from "@ohos:base";
import { APP_VERSION_NAME } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
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
class SplashPage extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.meshAngle = 0;
        this.meshScale = 0.88;
        this.meshBreath = 0;
        this.meshDrawAlpha = 1;
        this.brandAlpha = 0;
        this.meshVertices = [];
        this.meshEdges = [];
        this.projBuf = [];
        this.sortOrder = [];
        this.edgeDepthBuf = [];
        this.animTimer = -1;
        this.exitTimer = -1;
        this.settleTimers = [];
        this.canvasSettings = new RenderingContextSettings(true);
        this.canvasCtx = new CanvasRenderingContext2D(this.canvasSettings);
        this.canvasW = 0;
        this.canvasH = 0;
        this.startTime = 0;
        this.entering = true;
        this.exiting = false;
        this.navigated = false;
        this.surfaceReady = false;
        this.animStarted = false;
        this.frameCount = 0;
        this.statusText = 'Initializing simulation kernel...';
        this.progress = 0;
        this.lastStageIdx = 0;
        this.TOTAL_MS = 2800;
        this.EXIT_MS = 520;
        this.stages = [
            { atMs: 0, text: 'Initializing simulation kernel...' },
            { atMs: 550, text: 'Loading component library...' },
            { atMs: 1100, text: 'Configuring AI routing engine...' },
            { atMs: 1750, text: 'Preparing schematic workspace...' },
            { atMs: 2500, text: 'Ready' }
        ];
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: SplashPage_Params) {
        if (params.meshAngle !== undefined) {
            this.meshAngle = params.meshAngle;
        }
        if (params.meshScale !== undefined) {
            this.meshScale = params.meshScale;
        }
        if (params.meshBreath !== undefined) {
            this.meshBreath = params.meshBreath;
        }
        if (params.meshDrawAlpha !== undefined) {
            this.meshDrawAlpha = params.meshDrawAlpha;
        }
        if (params.brandAlpha !== undefined) {
            this.brandAlpha = params.brandAlpha;
        }
        if (params.meshVertices !== undefined) {
            this.meshVertices = params.meshVertices;
        }
        if (params.meshEdges !== undefined) {
            this.meshEdges = params.meshEdges;
        }
        if (params.projBuf !== undefined) {
            this.projBuf = params.projBuf;
        }
        if (params.sortOrder !== undefined) {
            this.sortOrder = params.sortOrder;
        }
        if (params.edgeDepthBuf !== undefined) {
            this.edgeDepthBuf = params.edgeDepthBuf;
        }
        if (params.animTimer !== undefined) {
            this.animTimer = params.animTimer;
        }
        if (params.exitTimer !== undefined) {
            this.exitTimer = params.exitTimer;
        }
        if (params.settleTimers !== undefined) {
            this.settleTimers = params.settleTimers;
        }
        if (params.canvasSettings !== undefined) {
            this.canvasSettings = params.canvasSettings;
        }
        if (params.canvasCtx !== undefined) {
            this.canvasCtx = params.canvasCtx;
        }
        if (params.canvasW !== undefined) {
            this.canvasW = params.canvasW;
        }
        if (params.canvasH !== undefined) {
            this.canvasH = params.canvasH;
        }
        if (params.startTime !== undefined) {
            this.startTime = params.startTime;
        }
        if (params.entering !== undefined) {
            this.entering = params.entering;
        }
        if (params.exiting !== undefined) {
            this.exiting = params.exiting;
        }
        if (params.navigated !== undefined) {
            this.navigated = params.navigated;
        }
        if (params.surfaceReady !== undefined) {
            this.surfaceReady = params.surfaceReady;
        }
        if (params.animStarted !== undefined) {
            this.animStarted = params.animStarted;
        }
        if (params.frameCount !== undefined) {
            this.frameCount = params.frameCount;
        }
        if (params.statusText !== undefined) {
            this.statusText = params.statusText;
        }
        if (params.progress !== undefined) {
            this.progress = params.progress;
        }
        if (params.lastStageIdx !== undefined) {
            this.lastStageIdx = params.lastStageIdx;
        }
        if (params.TOTAL_MS !== undefined) {
            this.TOTAL_MS = params.TOTAL_MS;
        }
        if (params.EXIT_MS !== undefined) {
            this.EXIT_MS = params.EXIT_MS;
        }
        if (params.stages !== undefined) {
            this.stages = params.stages;
        }
    }
    updateStateVars(params: SplashPage_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
    }
    aboutToBeDeleted() {
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private meshAngle: number;
    private meshScale: number;
    private meshBreath: number;
    private meshDrawAlpha: number;
    private brandAlpha: number;
    private meshVertices: Vec3[];
    private meshEdges: MeshEdge[];
    private projBuf: ProjPoint[];
    private sortOrder: number[];
    private edgeDepthBuf: number[];
    private animTimer: number;
    private exitTimer: number;
    private settleTimers: number[];
    private canvasSettings: RenderingContextSettings;
    private canvasCtx: CanvasRenderingContext2D;
    private canvasW: number;
    private canvasH: number;
    private startTime: number;
    private entering: boolean;
    private exiting: boolean;
    private navigated: boolean;
    private surfaceReady: boolean;
    private animStarted: boolean;
    private frameCount: number;
    private statusText: string;
    private progress: number;
    private lastStageIdx: number;
    private readonly TOTAL_MS: number;
    private readonly EXIT_MS: number;
    private readonly stages: LoadingStage[];
    aboutToAppear(): void {
        this.generateMesh();
        // 布局可能晚于 onReady：与主画布同样补几次强制绘制 / 启动
        this.queueSettle(80);
        this.queueSettle(220);
        this.queueSettle(480);
    }
    aboutToDisappear(): void {
        this.clearTimers();
    }
    private queueSettle(delayMs: number): void {
        this.settleTimers.push(setTimeout(() => {
            this.tryStartAnimation();
            this.drawFrame(true);
        }, delayMs));
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
        for (let i = 0; i < this.settleTimers.length; i++) {
            clearTimeout(this.settleTimers[i]);
        }
        this.settleTimers = [];
    }
    private markSurface(w: number, h: number): void {
        if (w <= 1 || h <= 1) {
            return;
        }
        const sizeChanged = Math.abs(w - this.canvasW) > 0.5 || Math.abs(h - this.canvasH) > 0.5;
        this.canvasW = w;
        this.canvasH = h;
        this.surfaceReady = true;
        this.tryStartAnimation();
        if (sizeChanged || !this.animStarted) {
            this.drawFrame(true);
        }
    }
    private tryStartAnimation(): void {
        if (this.animStarted || this.navigated) {
            return;
        }
        if (!this.surfaceReady || this.canvasW <= 1 || this.canvasH <= 1) {
            return;
        }
        this.animStarted = true;
        this.startTime = Date.now();
        this.startAnimation();
    }
    private generateMesh(): void {
        const zSegs = 22;
        const tSegs = 32;
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
                }
                else {
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
        this.sortOrder = [];
        this.edgeDepthBuf = [];
        for (let e = 0; e < edges.length; e++) {
            this.sortOrder.push(e);
            this.edgeDepthBuf.push(0);
        }
    }
    private startAnimation(): void {
        const frameMs = 33;
        this.animTimer = setInterval(() => {
            this.meshAngle += 0.012;
            this.meshBreath += 0.045;
            this.frameCount++;
            if (this.entering && !this.exiting) {
                const enterT = Math.min((Date.now() - this.startTime) / 900, 1);
                const ease = 1 - Math.pow(1 - enterT, 2.4);
                this.meshScale = 0.88 + 0.12 * ease;
                // 品牌略晚于网格出现
                this.brandAlpha = Math.max(0, Math.min(1, (enterT - 0.12) / 0.55));
                if (enterT >= 1) {
                    this.entering = false;
                    this.brandAlpha = 1;
                }
            }
            this.drawFrame((this.frameCount % 2) === 0);
            if (this.exiting) {
                return;
            }
            const elapsed = Date.now() - this.startTime;
            this.progress = Math.min(100, Math.floor(elapsed / this.TOTAL_MS * 100));
            let stageIdx = 0;
            for (let i = this.stages.length - 1; i >= 0; i--) {
                if (elapsed >= this.stages[i].atMs) {
                    stageIdx = i;
                    break;
                }
            }
            if (stageIdx !== this.lastStageIdx) {
                this.lastStageIdx = stageIdx;
                this.statusText = this.stages[stageIdx].text;
            }
            if (elapsed >= this.TOTAL_MS) {
                this.beginExit();
            }
        }, frameMs);
    }
    private drawFrame(resort: boolean = true): void {
        const ctx = this.canvasCtx;
        const w = this.canvasW;
        const h = this.canvasH;
        if (!this.surfaceReady || w <= 1 || h <= 1) {
            return;
        }
        // 先铺黑底，避免透明缓冲偶发露出系统层
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        const breath = 1 + 0.02 * Math.sin(this.meshBreath);
        const cosA = Math.cos(this.meshAngle);
        const sinA = Math.sin(this.meshAngle);
        const camDist = 5.5;
        const screenCX = w * 0.50;
        const screenCY = h * 0.30;
        const projScale = Math.min(w, h) * 0.18 * this.meshScale * breath;
        const globalA = this.meshDrawAlpha;
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
            const pp = this.projBuf[i];
            pp.sx = rx * invZ + screenCX;
            pp.sy = -ry * invZ + screenCY;
            pp.depth = depth;
        }
        const depthSpan = Math.max(0.001, maxDepth - minDepth);
        if (resort) {
            for (let e = 0; e < this.meshEdges.length; e++) {
                const edge = this.meshEdges[e];
                this.edgeDepthBuf[e] = (this.projBuf[edge.a].depth + this.projBuf[edge.b].depth) * 0.5;
            }
            const depths = this.edgeDepthBuf;
            this.sortOrder.sort((ia: number, ib: number) => depths[ib] - depths[ia]);
        }
        for (let pass = 0; pass < 3; pass++) {
            let baseW: number;
            let baseA: number;
            if (pass === 0) {
                baseW = 3.8;
                baseA = 0.028;
            }
            else if (pass === 1) {
                baseW = 1.6;
                baseA = 0.10;
            }
            else {
                baseW = 0.75;
                baseA = 0.52;
            }
            for (let si = 0; si < this.sortOrder.length; si++) {
                const edge = this.meshEdges[this.sortOrder[si]];
                const p1 = this.projBuf[edge.a];
                const p2 = this.projBuf[edge.b];
                if (p1 === undefined || p2 === undefined) {
                    continue;
                }
                const edgeDepth = (p1.depth + p2.depth) * 0.5;
                const far = (edgeDepth - minDepth) / depthSpan;
                const depthFade = 1.0 - far * 0.55;
                const widthBoost = 1.0 + (1.0 - far) * 0.18;
                const zNorm = (edge.avgZ + 2.2) / 4.4;
                ctx.strokeStyle = this.edgeColor(zNorm, baseA * depthFade * globalA);
                ctx.lineWidth = baseW * widthBoost;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(p1.sx, p1.sy);
                ctx.lineTo(p2.sx, p2.sy);
                ctx.stroke();
            }
        }
        this.drawBrandAndHud(ctx, w, h);
    }
    private drawBrandAndHud(ctx: CanvasRenderingContext2D, w: number, h: number): void {
        const fade = Math.max(0, Math.min(1, this.brandAlpha * this.meshDrawAlpha));
        if (fade < 0.02) {
            return;
        }
        const cx = w * 0.5;
        const titleY = h * 0.62;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(255,255,255,${fade.toFixed(3)})`;
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('ElecDraw', cx, titleY);
        ctx.fillStyle = `rgba(255,255,255,${(0.42 * fade).toFixed(3)})`;
        ctx.font = '13px sans-serif';
        ctx.fillText('Hardware Schematic Simulator', cx, titleY + 28);
        const barW = Math.min(w * 0.38, 420);
        const barX = cx - barW * 0.5;
        const barY = titleY + 58;
        const barH = 2;
        ctx.fillStyle = `rgba(255,255,255,${(0.08 * fade).toFixed(3)})`;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = `rgba(120,210,255,${(0.72 * fade).toFixed(3)})`;
        ctx.fillRect(barX, barY, barW * Math.max(0.04, this.progress / 100), barH);
        ctx.fillStyle = `rgba(255,255,255,${(0.28 * fade).toFixed(3)})`;
        ctx.font = '12px sans-serif';
        ctx.fillText(this.statusText, cx, barY + 18);
        ctx.fillStyle = `rgba(255,255,255,${(0.18 * fade).toFixed(3)})`;
        ctx.font = '10px sans-serif';
        ctx.fillText(`v${APP_VERSION_NAME}`, cx, barY + 38);
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
        }
        else {
            const s = (t - 0.5) * 2;
            r = Math.round(255 - s * 255);
            g = Math.round(238 - s * (238 - 170));
            b = Math.round(s * 170);
        }
        const aa = Math.max(0, Math.min(1, alpha));
        return `rgba(${r},${g},${b},${aa.toFixed(3)})`;
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
        const expandStart = Date.now();
        const baseScale = this.meshScale;
        this.exitTimer = setInterval(() => {
            const elapsed = Date.now() - expandStart;
            const t = Math.min(elapsed / this.EXIT_MS, 1);
            const easeIn = t * t;
            this.meshScale = baseScale + 0.12 * easeIn;
            this.meshDrawAlpha = 1 - t;
            this.brandAlpha = Math.max(0, 1 - t * 1.15);
            this.drawFrame(false);
            if (t >= 1) {
                clearInterval(this.exitTimer);
                this.exitTimer = -1;
                this.navigateToIndex();
            }
        }, 30);
    }
    private navigateToIndex(): void {
        if (this.navigated) {
            return;
        }
        this.navigated = true;
        this.clearTimers();
        try {
            this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' })
                .catch((_err: BusinessError) => {
                this.navigated = false;
                setTimeout(() => {
                    if (!this.navigated) {
                        this.navigated = true;
                        try {
                            this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' });
                        }
                        catch (_e2) {
                            // ignore
                        }
                    }
                }, 160);
            });
        }
        catch (_e) {
            this.navigated = false;
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
            Stack.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 系统层兜底黑底（Canvas 未就绪时也不闪白）
            Column.create();
            // 系统层兜底黑底（Canvas 未就绪时也不闪白）
            Column.width('100%');
            // 系统层兜底黑底（Canvas 未就绪时也不闪白）
            Column.height('100%');
            // 系统层兜底黑底（Canvas 未就绪时也不闪白）
            Column.backgroundColor('#000000');
        }, Column);
        // 系统层兜底黑底（Canvas 未就绪时也不闪白）
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Canvas.create(this.canvasCtx);
            Canvas.width('100%');
            Canvas.height('100%');
            Canvas.hitTestBehavior(HitTestMode.None);
            Canvas.onReady(() => {
                this.surfaceReady = true;
                this.tryStartAnimation();
                this.drawFrame(true);
            });
            Canvas.onAreaChange((_old, area) => {
                this.markSurface(Number(area.width), Number(area.height));
            });
        }, Canvas);
        Canvas.pop();
        Stack.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
    static getEntryName(): string {
        return "SplashPage";
    }
}
registerNamedRoute(() => new SplashPage(undefined, {}), "", { bundleName: "com.elecdraw.aischsim", moduleName: "entry", pagePath: "pages/SplashPage", pageFullPath: "entry/src/main/ets/pages/SplashPage", integratedHsp: "false", moduleType: "followWithHap" });
