if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface SplashPage_Params {
    pageOpacity?: number;
    textOpacity?: number;
    statusText?: string;
    meshAngle?: number;
    meshScale?: number;
    meshVertices?: Vec3[];
    meshEdges?: MeshEdge[];
    animTimer?: number;
    exitTimer?: number;
    canvasSettings?: RenderingContextSettings;
    canvasCtx?: CanvasRenderingContext2D;
    canvasW?: number;
    canvasH?: number;
    startTime?: number;
    stages?: LoadingStage[];
}
import type { BusinessError } from "@ohos:base";
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
    constructor(f225, g225, h225, i225 = -1, j225 = undefined, k225) {
        super(f225, h225, i225, k225);
        if (typeof j225 === "function") {
            this.paramsGenerator_ = j225;
        }
        this.__pageOpacity = new ObservedPropertySimplePU(1, this, "pageOpacity");
        this.__textOpacity = new ObservedPropertySimplePU(0, this, "textOpacity");
        this.__statusText = new ObservedPropertySimplePU('Initializing simulation kernel...', this, "statusText");
        this.meshAngle = 0;
        this.meshScale = 1;
        this.meshVertices = [];
        this.meshEdges = [];
        this.animTimer = -1;
        this.exitTimer = -1;
        this.canvasSettings = new RenderingContextSettings(true);
        this.canvasCtx = new CanvasRenderingContext2D(this.canvasSettings);
        this.canvasW = 1440;
        this.canvasH = 810;
        this.startTime = 0;
        this.stages = [
            { threshold: 0, text: 'Initializing simulation kernel...' },
            { threshold: 25, text: 'Loading component library...' },
            { threshold: 50, text: 'Configuring AI routing engine...' },
            { threshold: 75, text: 'Preparing schematic workspace...' },
            { threshold: 95, text: 'Ready' }
        ];
        this.setInitiallyProvidedValue(g225);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(e225: SplashPage_Params) {
        if (e225.pageOpacity !== undefined) {
            this.pageOpacity = e225.pageOpacity;
        }
        if (e225.textOpacity !== undefined) {
            this.textOpacity = e225.textOpacity;
        }
        if (e225.statusText !== undefined) {
            this.statusText = e225.statusText;
        }
        if (e225.meshAngle !== undefined) {
            this.meshAngle = e225.meshAngle;
        }
        if (e225.meshScale !== undefined) {
            this.meshScale = e225.meshScale;
        }
        if (e225.meshVertices !== undefined) {
            this.meshVertices = e225.meshVertices;
        }
        if (e225.meshEdges !== undefined) {
            this.meshEdges = e225.meshEdges;
        }
        if (e225.animTimer !== undefined) {
            this.animTimer = e225.animTimer;
        }
        if (e225.exitTimer !== undefined) {
            this.exitTimer = e225.exitTimer;
        }
        if (e225.canvasSettings !== undefined) {
            this.canvasSettings = e225.canvasSettings;
        }
        if (e225.canvasCtx !== undefined) {
            this.canvasCtx = e225.canvasCtx;
        }
        if (e225.canvasW !== undefined) {
            this.canvasW = e225.canvasW;
        }
        if (e225.canvasH !== undefined) {
            this.canvasH = e225.canvasH;
        }
        if (e225.startTime !== undefined) {
            this.startTime = e225.startTime;
        }
        if (e225.stages !== undefined) {
            this.stages = e225.stages;
        }
    }
    updateStateVars(d225: SplashPage_Params) {
    }
    purgeVariableDependenciesOnElmtId(c225) {
        this.__pageOpacity.purgeDependencyOnElmtId(c225);
        this.__textOpacity.purgeDependencyOnElmtId(c225);
        this.__statusText.purgeDependencyOnElmtId(c225);
    }
    aboutToBeDeleted() {
        this.__pageOpacity.aboutToBeDeleted();
        this.__textOpacity.aboutToBeDeleted();
        this.__statusText.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __pageOpacity: ObservedPropertySimplePU<number>;
    get pageOpacity() {
        return this.__pageOpacity.get();
    }
    set pageOpacity(b225: number) {
        this.__pageOpacity.set(b225);
    }
    private __textOpacity: ObservedPropertySimplePU<number>;
    get textOpacity() {
        return this.__textOpacity.get();
    }
    set textOpacity(a225: number) {
        this.__textOpacity.set(a225);
    }
    private __statusText: ObservedPropertySimplePU<string>;
    get statusText() {
        return this.__statusText.get();
    }
    set statusText(z224: string) {
        this.__statusText.set(z224);
    }
    private meshAngle: number;
    private meshScale: number;
    private meshVertices: Vec3[];
    private meshEdges: MeshEdge[];
    private animTimer: number;
    private exitTimer: number;
    private canvasSettings: RenderingContextSettings;
    private canvasCtx: CanvasRenderingContext2D;
    private canvasW: number;
    private canvasH: number;
    private startTime: number;
    private readonly stages: LoadingStage[];
    aboutToAppear(): void {
        this.startTime = Date.now();
        this.generateMesh();
        try {
            this.getUIContext()?.animateTo({ duration: 900, curve: Curve.EaseOut }, () => {
                this.textOpacity = 1;
            });
        }
        catch (y224) { }
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
    private generateMesh(): void {
        const h223 = 28;
        const i223 = 44;
        const j223 = 2.2;
        const k223 = 1.6;
        const l223 = 1.0;
        const m223 = 0.65;
        const n223 = 0.85;
        const o223 = 1.05;
        const p223: Vec3[] = [];
        const q223: Vec3[][] = [];
        const r223: boolean[][] = [];
        for (let m224 = 0; m224 <= h223; m224++) {
            const n224 = -j223 + (2 * j223 * m224) / h223;
            const o224 = Math.sqrt(1 + n224 * n224);
            const p224: Vec3[] = [];
            const q224: boolean[] = [];
            for (let r224 = 0; r224 < i223; r224++) {
                const s224 = (2 * Math.PI * r224) / i223;
                const t224 = n224 / n223;
                const u224 = (s224 - Math.PI) / o223;
                const v224 = t224 * t224 + u224 * u224 < 1.0;
                const w224 = l223 * o224 * Math.cos(s224 + k223 * n224);
                const x224 = m223 * o224 * Math.sin(s224 + k223 * n224);
                p224.push({ x: w224, y: x224, z: n224 });
                q224.push(!v224);
                if (!v224) {
                    p223.push({ x: w224, y: x224, z: n224 });
                }
            }
            q223.push(p224);
            r223.push(q224);
        }
        const s223: MeshEdge[] = [];
        const t223 = new Set<string>();
        const u223 = new Map<string, number>();
        for (let l224 = 0; l224 < p223.length; l224++) {
            u223.set(`${p223[l224].x.toFixed(4)},${p223[l224].y.toFixed(4)},${p223[l224].z.toFixed(4)}`, l224);
        }
        let v223 = 0;
        const w223: number[][] = [];
        for (let i224 = 0; i224 <= h223; i224++) {
            const j224: number[] = [];
            for (let k224 = 0; k224 < i223; k224++) {
                if (r223[i224][k224]) {
                    j224.push(v223);
                    v223++;
                }
                else {
                    j224.push(-1);
                }
            }
            w223.push(j224);
        }
        const x223 = (f224: number, g224: number): void => {
            if (f224 < 0 || g224 < 0) {
                return;
            }
            const h224 = f224 < g224 ? `${f224},${g224}` : `${g224},${f224}`;
            if (!t223.has(h224)) {
                t223.add(h224);
                s223.push({
                    a: f224, b: g224,
                    avgZ: (p223[f224].z + p223[g224].z) / 2
                });
            }
        };
        for (let y223 = 0; y223 < h223; y223++) {
            for (let z223 = 0; z223 < i223; z223++) {
                const a224 = (z223 + 1) % i223;
                const b224 = w223[y223][z223];
                const c224 = w223[y223][a224];
                const d224 = w223[y223 + 1][z223];
                const e224 = w223[y223 + 1][a224];
                x223(b224, c224);
                x223(b224, d224);
                x223(b224, e224);
            }
        }
        this.meshVertices = p223;
        this.meshEdges = s223;
    }
    private startAnimation(): void {
        const b223 = 30;
        this.animTimer = setInterval(() => {
            this.meshAngle += 0.008;
            this.drawFrame();
            const c223 = Date.now() - this.startTime;
            const d223 = 3200;
            const e223 = Math.min(c223 / d223, 1);
            const f223 = Math.floor(e223 * 100);
            for (let g223 = this.stages.length - 1; g223 >= 0; g223--) {
                if (f223 >= this.stages[g223].threshold) {
                    this.statusText = this.stages[g223].text;
                    break;
                }
            }
            if (e223 >= 1) {
                this.finish();
            }
        }, 1000 / b223);
    }
    private drawFrame(): void {
        const z221 = this.canvasCtx;
        const a222 = this.canvasW;
        const b222 = this.canvasH;
        if (a222 <= 0 || b222 <= 0) {
            return;
        }
        z221.clearRect(0, 0, a222, b222);
        const c222: ProjPoint[] = [];
        const d222 = Math.cos(this.meshAngle);
        const e222 = Math.sin(this.meshAngle);
        const f222 = 5.5;
        const g222 = a222 * 0.68;
        const h222 = b222 * 0.38;
        const i222 = Math.min(a222, b222) * 0.28 * this.meshScale;
        for (let t222 = 0; t222 < this.meshVertices.length; t222++) {
            const u222 = this.meshVertices[t222];
            const v222 = u222.x * d222 - u222.z * e222;
            const w222 = u222.x * e222 + u222.z * d222;
            const x222 = u222.y;
            const y222 = w222 + f222;
            const z222 = i222 / y222;
            const a223: ProjPoint = {
                sx: v222 * z222 + g222,
                sy: -x222 * z222 + h222,
                depth: y222
            };
            c222.push(a223);
        }
        const j222 = this.meshEdges.slice();
        for (let k222 = 0; k222 < 3; k222++) {
            let l222: number;
            let m222: number;
            if (k222 === 0) {
                l222 = 5;
                m222 = 0.06;
            }
            else if (k222 === 1) {
                l222 = 2.2;
                m222 = 0.22;
            }
            else {
                l222 = 0.9;
                m222 = 0.75;
            }
            for (let n222 = 0; n222 < j222.length; n222++) {
                const o222 = j222[n222];
                const p222 = c222[o222.a];
                const q222 = c222[o222.b];
                if (p222 === undefined || q222 === undefined) {
                    continue;
                }
                const r222 = (o222.avgZ + 2.2) / 4.4;
                const s222 = this.edgeColor(r222, m222);
                z221.strokeStyle = s222;
                z221.lineWidth = l222;
                z221.lineCap = 'round';
                z221.beginPath();
                z221.moveTo(p222.sx, p222.sy);
                z221.lineTo(q222.sx, q222.sy);
                z221.stroke();
            }
        }
    }
    private edgeColor(s221: number, t221: number): string {
        let u221: number, v221: number, w221: number;
        if (s221 < 0.5) {
            const y221 = s221 * 2;
            u221 = Math.round(68 + y221 * (255 - 68));
            v221 = Math.round(170 + y221 * (238 - 170));
            w221 = Math.round(255 - y221 * 255);
        }
        else {
            const x221 = (s221 - 0.5) * 2;
            u221 = Math.round(255 - x221 * 255);
            v221 = Math.round(238 - x221 * (238 - 170));
            w221 = Math.round(x221 * 170);
        }
        return `rgba(${u221},${v221},${w221},${t221})`;
    }
    private finish(): void {
        clearInterval(this.animTimer);
        this.animTimer = -1;
        try {
            this.getUIContext()?.animateTo({ duration: 600, curve: Curve.EaseIn }, () => {
                this.textOpacity = 0;
            });
        }
        catch (r221) { }
        const l221 = Date.now();
        const m221 = setInterval(() => {
            const n221 = Date.now() - l221;
            const o221 = Math.min(n221 / 600, 1);
            const p221 = o221 * o221;
            this.meshScale = 1 + (2.5 * p221);
            this.pageOpacity = 1 - o221;
            this.drawFrame();
            if (o221 >= 1) {
                clearInterval(m221);
                this.getUIContext().getRouter().replaceUrl({ url: 'pages/Index' })
                    .catch((q221: BusinessError) => {
                });
            }
        }, 30);
    }
    initialRender() {
        this.observeComponentCreation2((j221, k221) => {
            Stack.create();
            Stack.width('100%');
            Stack.height('100%');
            Stack.opacity(Math.max(0, this.pageOpacity));
            Stack.expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM]);
        }, Stack);
        this.observeComponentCreation2((h221, i221) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#000000');
        }, Column);
        Column.pop();
        this.observeComponentCreation2((d221, e221) => {
            Canvas.create(this.canvasCtx);
            Canvas.width('100%');
            Canvas.height('100%');
            Canvas.onReady(() => {
                this.drawFrame();
            });
            Canvas.onAreaChange((f221, g221) => {
                this.canvasW = g221.width as number;
                this.canvasH = g221.height as number;
            });
            Canvas.hitTestBehavior(HitTestMode.None);
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((b221, c221) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((z220, a221) => {
            Blank.create();
            Blank.layoutWeight(1);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((x220, y220) => {
            Column.create({ space: 0 });
            Column.alignItems(HorizontalAlign.Start);
            Column.padding({ left: 72 });
        }, Column);
        this.observeComponentCreation2((v220, w220) => {
            Text.create('ElecDraw');
            Text.fontSize(38);
            Text.fontWeight(FontWeight.Bold);
            Text.fontColor('#FFFFFF');
            Text.fontFamily('sans-serif');
            Text.letterSpacing(4);
            Text.opacity(this.textOpacity);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t220, u220) => {
            Blank.create();
            Blank.height(10);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((r220, s220) => {
            Text.create('Hardware Schematic Simulator');
            Text.fontSize(14);
            Text.fontColor('rgba(255,255,255,0.55)');
            Text.fontFamily('sans-serif');
            Text.letterSpacing(2);
            Text.opacity(this.textOpacity * 0.85);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((p220, q220) => {
            Blank.create();
            Blank.height(36);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((n220, o220) => {
            Text.create(this.statusText);
            Text.fontSize(12);
            Text.fontColor('rgba(255,255,255,0.35)');
            Text.fontFamily('sans-serif');
            Text.opacity(this.textOpacity * 0.7);
        }, Text);
        Text.pop();
        Column.pop();
        this.observeComponentCreation2((l220, m220) => {
            Blank.create();
            Blank.layoutWeight(1.2);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((j220, k220) => {
            Row.create({ space: 10 });
            Row.padding({ left: 72, bottom: 40 });
            Row.opacity(this.textOpacity * 0.8);
        }, Row);
        this.observeComponentCreation2((h220, i220) => {
            Row.create({ space: 1.5 });
        }, Row);
        this.observeComponentCreation2((f220, g220) => {
            Column.create();
            Column.width(6);
            Column.height(20);
            Column.backgroundColor('#44DDBB');
            Column.borderRadius(0);
        }, Column);
        Column.pop();
        this.observeComponentCreation2((d220, e220) => {
            Column.create();
            Column.width(6);
            Column.height(20);
            Column.backgroundColor('#FFEE44');
            Column.borderRadius(0);
        }, Column);
        Column.pop();
        this.observeComponentCreation2((b220, c220) => {
            Column.create();
            Column.width(6);
            Column.height(20);
            Column.backgroundColor('#44AAFF');
            Column.borderRadius(0);
        }, Column);
        Column.pop();
        Row.pop();
        this.observeComponentCreation2((z219, a220) => {
            Column.create({ space: 1 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((x219, y219) => {
            Text.create('ElecDraw');
            Text.fontSize(11);
            Text.fontColor('rgba(255,255,255,0.65)');
            Text.fontFamily('sans-serif');
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((v219, w219) => {
            Text.create('v1.0.0');
            Text.fontSize(9);
            Text.fontColor('rgba(255,255,255,0.30)');
            Text.fontFamily('sans-serif');
        }, Text);
        Text.pop();
        Column.pop();
        Row.pop();
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
