if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface LogicAnalyzerWaveCanvas_Params {
    channelData?: number[][];
    channelCount?: number;
    sampleCount?: number;
    canvasW?: number;
    canvasH?: number;
    settings?: RenderingContextSettings;
    ctx?: CanvasRenderingContext2D;
}
export class LogicAnalyzerWaveCanvas extends ViewPU {
    constructor(c95, d95, e95, f95 = -1, g95 = undefined, h95) {
        super(c95, e95, f95, h95);
        if (typeof g95 === "function") {
            this.paramsGenerator_ = g95;
        }
        this.__channelData = new SynchedPropertyObjectOneWayPU(d95.channelData, this, "channelData");
        this.__channelCount = new SynchedPropertySimpleOneWayPU(d95.channelCount, this, "channelCount");
        this.__sampleCount = new SynchedPropertySimpleOneWayPU(d95.sampleCount, this, "sampleCount");
        this.__canvasW = new ObservedPropertySimplePU(320, this, "canvasW");
        this.__canvasH = new ObservedPropertySimplePU(80, this, "canvasH");
        this.settings = new RenderingContextSettings(true);
        this.ctx = new CanvasRenderingContext2D(this.settings);
        this.setInitiallyProvidedValue(d95);
        this.declareWatch("channelData", this.onDataChanged);
        this.declareWatch("channelCount", this.onDataChanged);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(b95: LogicAnalyzerWaveCanvas_Params) {
        if (b95.channelData === undefined) {
            this.__channelData.set([]);
        }
        if (b95.channelCount === undefined) {
            this.__channelCount.set(8);
        }
        if (b95.sampleCount === undefined) {
            this.__sampleCount.set(128);
        }
        if (b95.canvasW !== undefined) {
            this.canvasW = b95.canvasW;
        }
        if (b95.canvasH !== undefined) {
            this.canvasH = b95.canvasH;
        }
        if (b95.settings !== undefined) {
            this.settings = b95.settings;
        }
        if (b95.ctx !== undefined) {
            this.ctx = b95.ctx;
        }
    }
    updateStateVars(a95: LogicAnalyzerWaveCanvas_Params) {
        this.__channelData.reset(a95.channelData);
        this.__channelCount.reset(a95.channelCount);
        this.__sampleCount.reset(a95.sampleCount);
    }
    purgeVariableDependenciesOnElmtId(z94) {
        this.__channelData.purgeDependencyOnElmtId(z94);
        this.__channelCount.purgeDependencyOnElmtId(z94);
        this.__sampleCount.purgeDependencyOnElmtId(z94);
        this.__canvasW.purgeDependencyOnElmtId(z94);
        this.__canvasH.purgeDependencyOnElmtId(z94);
    }
    aboutToBeDeleted() {
        this.__channelData.aboutToBeDeleted();
        this.__channelCount.aboutToBeDeleted();
        this.__sampleCount.aboutToBeDeleted();
        this.__canvasW.aboutToBeDeleted();
        this.__canvasH.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __channelData: SynchedPropertySimpleOneWayPU<number[][]>;
    get channelData() {
        return this.__channelData.get();
    }
    set channelData(y94: number[][]) {
        this.__channelData.set(y94);
    }
    private __channelCount: SynchedPropertySimpleOneWayPU<number>;
    get channelCount() {
        return this.__channelCount.get();
    }
    set channelCount(x94: number) {
        this.__channelCount.set(x94);
    }
    private __sampleCount: SynchedPropertySimpleOneWayPU<number>;
    get sampleCount() {
        return this.__sampleCount.get();
    }
    set sampleCount(w94: number) {
        this.__sampleCount.set(w94);
    }
    private __canvasW: ObservedPropertySimplePU<number>;
    get canvasW() {
        return this.__canvasW.get();
    }
    set canvasW(v94: number) {
        this.__canvasW.set(v94);
    }
    private __canvasH: ObservedPropertySimplePU<number>;
    get canvasH() {
        return this.__canvasH.get();
    }
    set canvasH(u94: number) {
        this.__canvasH.set(u94);
    }
    private settings: RenderingContextSettings;
    private ctx: CanvasRenderingContext2D;
    onDataChanged(): void {
        this.drawLogic();
    }
    initialRender() {
        this.observeComponentCreation2((q94, r94) => {
            Canvas.create(this.ctx);
            Canvas.width('100%');
            Canvas.height(80);
            Canvas.backgroundColor('#0a0a12');
            Canvas.onAreaChange((s94: Area, t94: Area) => {
                this.canvasW = t94.width as number;
                this.canvasH = t94.height as number;
                this.drawLogic();
            });
            Canvas.onAppear(() => this.drawLogic());
        }, Canvas);
        Canvas.pop();
    }
    drawLogic(): void {
        const b94 = this.ctx;
        const c94 = this.canvasW;
        const d94 = this.canvasH;
        if (c94 <= 0 || d94 <= 0)
            return;
        b94.clearRect(0, 0, c94, d94);
        b94.fillStyle = '#0a0a12';
        b94.fillRect(0, 0, c94, d94);
        const e94 = Math.min(this.channelCount, this.channelData.length);
        if (e94 === 0) {
            b94.fillStyle = '#555';
            b94.font = '10px monospace';
            b94.fillText('点击采样捕获逻辑波形', 8, d94 / 2 + 4);
            return;
        }
        const f94 = d94 / e94;
        b94.strokeStyle = '#1a1a2e';
        b94.lineWidth = 0.5;
        for (let o94 = 0; o94 < e94; o94++) {
            const p94 = o94 * f94;
            b94.beginPath();
            b94.moveTo(0, p94);
            b94.lineTo(c94, p94);
            b94.stroke();
        }
        for (let g94 = 0; g94 < e94; g94++) {
            const h94 = this.channelData[g94];
            const i94 = g94 * f94 + f94 * 0.75;
            const j94 = g94 * f94 + f94 * 0.25;
            b94.strokeStyle = '#00e676';
            b94.lineWidth = 1;
            b94.beginPath();
            const k94 = Math.min(h94.length, this.sampleCount);
            for (let l94 = 0; l94 < k94; l94++) {
                const m94 = (l94 / (k94 > 1 ? k94 - 1 : 1)) * c94;
                const n94 = h94[l94] > 0 ? j94 : i94;
                if (l94 === 0)
                    b94.moveTo(m94, n94);
                else
                    b94.lineTo(m94, n94);
            }
            b94.stroke();
            b94.fillStyle = '#808090';
            b94.font = '8px monospace';
            b94.fillText(`D${g94}`, 3, g94 * f94 + 10);
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
