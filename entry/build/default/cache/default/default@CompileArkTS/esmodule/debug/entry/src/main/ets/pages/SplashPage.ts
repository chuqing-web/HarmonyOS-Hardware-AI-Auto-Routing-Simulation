if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface SplashPage_Params {
    pageOpacity?: number;
    titleOpacity?: number;
    subOpacity?: number;
    statusOpacity?: number;
    statusText?: string;
    meshAngle?: number;
    meshScale?: number;
    meshBreath?: number;
    meshVertices?: Vec3[];
    meshEdges?: MeshEdge[];
    animTimer?: number;
    exitTimer?: number;
    canvasSettings?: RenderingContextSettings;
    canvasCtx?: CanvasRenderingContext2D;
    canvasW?: number;
    canvasH?: number;
    startTime?: number;
    entering?: boolean;
    exiting?: boolean;
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
    threshold: number;
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
        this.__pageOpacity = new ObservedPropertySimplePU(1, this, "pageOpacity");
        this.__titleOpacity = new ObservedPropertySimplePU(0, this, "titleOpacity");
        this.__subOpacity = new ObservedPropertySimplePU(0, this, "subOpacity");
        this.__statusOpacity = new ObservedPropertySimplePU(0, this, "statusOpacity");
        this.__statusText = new ObservedPropertySimplePU('Initializing simulation kernel...', this, "statusText");
        this.meshAngle = 0;
        this.meshScale = 0.88;
        this.meshBreath = 0;
        this.meshVertices = [];
        this.meshEdges = [];
        this.animTimer = -1;
        this.exitTimer = -1;
        this.canvasSettings = new RenderingContextSettings(true);
        this.canvasCtx = new CanvasRenderingContext2D(this.canvasSettings);
        this.canvasW = 0;
        this.canvasH = 0;
        this.startTime = 0;
        this.entering = true;
        this.exiting = false;
        this.stages = [
            { threshold: 0, text: 'Initializing simulation kernel...' },
            { threshold: 25, text: 'Loading component library...' },
            { threshold: 50, text: 'Configuring AI routing engine...' },
            { threshold: 75, text: 'Preparing schematic workspace...' },
            { threshold: 95, text: 'Ready' }
        ];
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: SplashPage_Params) {
        if (params.pageOpacity !== undefined) {
            this.pageOpacity = params.pageOpacity;
        }
        if (params.titleOpacity !== undefined) {
            this.titleOpacity = params.titleOpacity;
        }
        if (params.subOpacity !== undefined) {
            this.subOpacity = params.subOpacity;
        }
        if (params.statusOpacity !== undefined) {
            this.statusOpacity = params.statusOpacity;
        }
        if (params.statusText !== undefined) {
            this.statusText = params.statusText;
        }
        if (params.meshAngle !== undefined) {
            this.meshAngle = params.meshAngle;
        }
        if (params.meshScale !== undefined) {
            this.meshScale = params.meshScale;
        }
        if (params.meshBreath !== undefined) {
            this.meshBreath = params.meshBreath;
        }
        if (params.meshVertices !== undefined) {
            this.meshVertices = params.meshVertices;
        }
        if (params.meshEdges !== undefined) {
            this.meshEdges = params.meshEdges;
        }
        if (params.animTimer !== undefined) {
            this.animTimer = params.animTimer;
        }
        if (params.exitTimer !== undefined) {
            this.exitTimer = params.exitTimer;
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
        if (params.stages !== undefined) {
            this.stages = params.stages;
        }
    }
    updateStateVars(params: SplashPage_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__pageOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__titleOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__subOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__statusOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__statusText.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__pageOpacity.aboutToBeDeleted();
        this.__titleOpacity.aboutToBeDeleted();
        this.__subOpacity.aboutToBeDeleted();
        this.__statusOpacity.aboutToBeDeleted();
        this.__statusText.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __pageOpacity: ObservedPropertySimplePU<number>;
    get pageOpacity() {
        return this.__pageOpacity.get();
    }
    set pageOpacity(newValue: number) {
        this.__pageOpacity.set(newValue);
    }
    private __titleOpacity: ObservedPropertySimplePU<number>;
    get titleOpacity() {
        return this.__titleOpacity.get();
    }
    set titleOpacity(newValue: number) {
        this.__titleOpacity.set(newValue);
    }
    private __subOpacity: ObservedPropertySimplePU<number>;
    get subOpacity() {
        return this.__subOpacity.get();
    }
    set subOpacity(newValue: number) {
        this.__subOpacity.set(newValue);
    }
    private __statusOpacity: ObservedPropertySimplePU<number>;
    get statusOpacity() {
        return this.__statusOpacity.get();
    }
    set statusOpacity(newValue: number) {
        this.__statusOpacity.set(newValue);
    }
    private __statusText: ObservedPropertySimplePU<string>;
    get statusText() {
        return this.__statusText.get();
    }
    set statusText(newValue: string) {
        this.__statusText.set(newValue);
    }
    private meshAngle: number;
    private meshScale: number;
    private meshBreath: number;
    private meshVertices: Vec3[];
    private meshEdges: MeshEdge[];
    private animTimer: number;
    private exitTimer: number;
    private canvasSettings: RenderingContextSettings;
    private canvasCtx: CanvasRenderingContext2D;
    private canvasW: number;
    private canvasH: number;
    private startTime: number;
    private entering: boolean;
    private exiting: boolean;
    private readonly stages: LoadingStage[];
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
        }
        catch (_e) {
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
            }
            else if (pass === 1) {
                baseW = 1.6;
                baseA = 0.10;
            }
            else {
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
        }
        else {
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
        }
        catch (_e) {
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
            Stack.opacity(Math.max(0, this.pageOpacity));
            Stack.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#000000');
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Canvas.create(this.canvasCtx);
            Canvas.width('100%');
            Canvas.height('100%');
            Canvas.onReady(() => {
                this.drawFrame();
            });
            Canvas.onAreaChange((_old, area) => {
                const nw = Number(area.width);
                const nh = Number(area.height);
                if (nw > 1 && nh > 1) {
                    this.canvasW = nw;
                    this.canvasH = nh;
                    this.drawFrame();
                }
            });
            Canvas.hitTestBehavior(HitTestMode.None);
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 静态文案固定下半区；上方留给动态曲面，互不叠压
            Column.create();
            // 静态文案固定下半区；上方留给动态曲面，互不叠压
            Column.width('100%');
            // 静态文案固定下半区；上方留给动态曲面，互不叠压
            Column.height('100%');
            // 静态文案固定下半区；上方留给动态曲面，互不叠压
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.layoutWeight(1.75);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 0 });
            Column.alignItems(HorizontalAlign.Center);
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('ElecDraw');
            Text.fontSize(34);
            Text.fontWeight(FontWeight.Bold);
            Text.fontColor('#FFFFFF');
            Text.fontFamily('sans-serif');
            Text.letterSpacing(5);
            Text.opacity(this.titleOpacity);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.height(10);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('Hardware Schematic Simulator');
            Text.fontSize(13);
            Text.fontColor('rgba(255,255,255,0.42)');
            Text.fontFamily('sans-serif');
            Text.letterSpacing(2.5);
            Text.opacity(this.subOpacity);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.height(24);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.statusText);
            Text.fontSize(12);
            Text.fontColor('rgba(255,255,255,0.28)');
            Text.fontFamily('sans-serif');
            Text.opacity(this.statusOpacity);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.height(14);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`v${APP_VERSION_NAME}`);
            Text.fontSize(10);
            Text.fontColor('rgba(255,255,255,0.20)');
            Text.fontFamily('sans-serif');
            Text.letterSpacing(1);
            Text.opacity(this.statusOpacity * 0.9);
        }, Text);
        Text.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.layoutWeight(0.55);
        }, Blank);
        Blank.pop();
        // 静态文案固定下半区；上方留给动态曲面，互不叠压
        Column.pop();
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
