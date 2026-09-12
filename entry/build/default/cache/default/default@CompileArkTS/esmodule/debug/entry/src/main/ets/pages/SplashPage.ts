if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface SplashPage_Params {
    pageOpacity?: number;
    textOpacity?: number;
    statusText?: string;
    progress?: number;
    versionLabel?: string;
    meshAngle?: number;
    meshScale?: number;
    meshBreath?: number;
    meshDrawAlpha?: number;
    meshVertices?: Vec3[];
    meshEdges?: MeshEdge[];
    projBuf?: ProjPoint[];
    animTimer?: number;
    exitTimer?: number;
    canvasSettings?: RenderingContextSettings;
    canvasCtx?: CanvasRenderingContext2D;
    canvasW?: number;
    canvasH?: number;
    startTime?: number;
    entering?: boolean;
    exiting?: boolean;
    navigated?: boolean;
    animStarted?: boolean;
    contextReady?: boolean;
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
        this.__pageOpacity = new ObservedPropertySimplePU(1, this, "pageOpacity");
        this.__textOpacity = new ObservedPropertySimplePU(0, this, "textOpacity");
        this.__statusText = new ObservedPropertySimplePU('Initializing simulation kernel...', this, "statusText");
        this.__progress = new ObservedPropertySimplePU(0, this, "progress");
        this.__versionLabel = new ObservedPropertySimplePU(`v${APP_VERSION_NAME}`, this, "versionLabel");
        this.meshAngle = 0;
        this.meshScale = 0.92;
        this.meshBreath = 0;
        this.meshDrawAlpha = 1;
        this.meshVertices = [];
        this.meshEdges = [];
        this.projBuf = [];
        this.animTimer = -1;
        this.exitTimer = -1;
        this.canvasSettings = new RenderingContextSettings(true);
        this.canvasCtx = new CanvasRenderingContext2D(this.canvasSettings);
        this.canvasW = 1280;
        this.canvasH = 800;
        this.startTime = 0;
        this.entering = true;
        this.exiting = false;
        this.navigated = false;
        this.animStarted = false;
        this.contextReady = false;
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
        if (params.pageOpacity !== undefined) {
            this.pageOpacity = params.pageOpacity;
        }
        if (params.textOpacity !== undefined) {
            this.textOpacity = params.textOpacity;
        }
        if (params.statusText !== undefined) {
            this.statusText = params.statusText;
        }
        if (params.progress !== undefined) {
            this.progress = params.progress;
        }
        if (params.versionLabel !== undefined) {
            this.versionLabel = params.versionLabel;
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
        if (params.meshDrawAlpha !== undefined) {
            this.meshDrawAlpha = params.meshDrawAlpha;
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
        if (params.navigated !== undefined) {
            this.navigated = params.navigated;
        }
        if (params.animStarted !== undefined) {
            this.animStarted = params.animStarted;
        }
        if (params.contextReady !== undefined) {
            this.contextReady = params.contextReady;
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
        this.__pageOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__textOpacity.purgeDependencyOnElmtId(rmElmtId);
        this.__statusText.purgeDependencyOnElmtId(rmElmtId);
        this.__progress.purgeDependencyOnElmtId(rmElmtId);
        this.__versionLabel.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__pageOpacity.aboutToBeDeleted();
        this.__textOpacity.aboutToBeDeleted();
        this.__statusText.aboutToBeDeleted();
        this.__progress.aboutToBeDeleted();
        this.__versionLabel.aboutToBeDeleted();
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
    private __textOpacity: ObservedPropertySimplePU<number>;
    get textOpacity() {
        return this.__textOpacity.get();
    }
    set textOpacity(newValue: number) {
        this.__textOpacity.set(newValue);
    }
    private __statusText: ObservedPropertySimplePU<string>;
    get statusText() {
        return this.__statusText.get();
    }
    set statusText(newValue: string) {
        this.__statusText.set(newValue);
    }
    private __progress: ObservedPropertySimplePU<number>;
    get progress() {
        return this.__progress.get();
    }
    set progress(newValue: number) {
        this.__progress.set(newValue);
    }
    private __versionLabel: ObservedPropertySimplePU<string>;
    get versionLabel() {
        return this.__versionLabel.get();
    }
    set versionLabel(newValue: string) {
        this.__versionLabel.set(newValue);
    }
    private meshAngle: number;
    private meshScale: number;
    private meshBreath: number;
    private meshDrawAlpha: number;
    private meshVertices: Vec3[];
    private meshEdges: MeshEdge[];
    private projBuf: ProjPoint[];
    private animTimer: number;
    private exitTimer: number;
    private canvasSettings: RenderingContextSettings;
    private canvasCtx: CanvasRenderingContext2D;
    /** 缺省非 0：避免 onAreaChange 迟到时整段空画 */
    private canvasW: number;
    private canvasH: number;
    private startTime: number;
    private entering: boolean;
    private exiting: boolean;
    private navigated: boolean;
    private animStarted: boolean;
    private contextReady: boolean;
    private readonly TOTAL_MS: number;
    private readonly EXIT_MS: number;
    private readonly stages: LoadingStage[];
    aboutToAppear(): void {
        this.generateMesh();
        try {
            this.getUIContext().animateTo({ duration: 900, curve: Curve.EaseOut }, () => {
                this.textOpacity = 1;
            });
        }
        catch (_e) {
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
        }
        catch (_e) {
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
        }
        catch (_eClear) {
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
            }
            else if (pass === 1) {
                baseW = 2.2;
                baseA = 0.28;
            }
            else {
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
        }
        else {
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
        }
        catch (_e) {
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
            Stack.backgroundColor('#000000');
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
            Canvas.hitTestBehavior(HitTestMode.None);
            Canvas.onReady(() => {
                this.contextReady = true;
                this.syncCanvasSizeFromContext();
                this.tryStartAnimation();
                this.drawFrame();
            });
            Canvas.onAreaChange((_old, area) => {
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
            });
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 左侧文案：不依赖 Canvas 文字，保证启动页绝不是“纯黑一片”
            Column.create();
            // 左侧文案：不依赖 Canvas 文字，保证启动页绝不是“纯黑一片”
            Column.width('100%');
            // 左侧文案：不依赖 Canvas 文字，保证启动页绝不是“纯黑一片”
            Column.height('100%');
            // 左侧文案：不依赖 Canvas 文字，保证启动页绝不是“纯黑一片”
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.layoutWeight(1);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 0 });
            Column.alignItems(HorizontalAlign.Start);
            Column.padding({ left: 72 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('ElecDraw');
            Text.fontSize(38);
            Text.fontWeight(FontWeight.Bold);
            Text.fontColor('#FFFFFF');
            Text.letterSpacing(4);
            Text.opacity(this.textOpacity);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.height(10);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('Hardware Schematic Simulator');
            Text.fontSize(14);
            Text.fontColor('rgba(255,255,255,0.55)');
            Text.letterSpacing(2);
            Text.opacity(this.textOpacity * 0.85);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.height(28);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 进度条
            Row.create();
            // 进度条
            Row.width(220);
            // 进度条
            Row.height(2);
            // 进度条
            Row.backgroundColor('rgba(255,255,255,0.12)');
            // 进度条
            Row.opacity(this.textOpacity);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width(`${Math.max(4, this.progress)}%`);
            Row.height(2);
            Row.backgroundColor('rgba(120,210,255,0.85)');
        }, Row);
        Row.pop();
        // 进度条
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.height(14);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.statusText);
            Text.fontSize(12);
            Text.fontColor('rgba(255,255,255,0.40)');
            Text.opacity(this.textOpacity * 0.85);
        }, Text);
        Text.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.layoutWeight(1.15);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 10 });
            Row.padding({ left: 72, bottom: 40 });
            Row.opacity(this.textOpacity * 0.85);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 1.5 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(6);
            Column.height(20);
            Column.backgroundColor('#44DDBB');
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(6);
            Column.height(20);
            Column.backgroundColor('#FFEE44');
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(6);
            Column.height(20);
            Column.backgroundColor('#44AAFF');
        }, Column);
        Column.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 1 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('ElecDraw');
            Text.fontSize(11);
            Text.fontColor('rgba(255,255,255,0.65)');
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.versionLabel);
            Text.fontSize(9);
            Text.fontColor('rgba(255,255,255,0.30)');
        }, Text);
        Text.pop();
        Column.pop();
        Row.pop();
        // 左侧文案：不依赖 Canvas 文字，保证启动页绝不是“纯黑一片”
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
