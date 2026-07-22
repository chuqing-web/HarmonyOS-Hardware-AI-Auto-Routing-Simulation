if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface LogicAnalyzerWaveCanvas_Params {
    channelData?: number[][];
    channelCount?: number;
    sampleCount?: number;
    canvasHeight?: number;
    canvasW?: number;
    canvasH?: number;
    settings?: RenderingContextSettings;
    ctx?: CanvasRenderingContext2D;
}
export class LogicAnalyzerWaveCanvas extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__channelData = new SynchedPropertyObjectOneWayPU(params.channelData, this, "channelData");
        this.__channelCount = new SynchedPropertySimpleOneWayPU(params.channelCount, this, "channelCount");
        this.__sampleCount = new SynchedPropertySimpleOneWayPU(params.sampleCount, this, "sampleCount");
        this.__canvasHeight = new SynchedPropertySimpleOneWayPU(params.canvasHeight, this, "canvasHeight");
        this.__canvasW = new ObservedPropertySimplePU(320, this, "canvasW");
        this.__canvasH = new ObservedPropertySimplePU(192, this, "canvasH");
        this.settings = new RenderingContextSettings(true);
        this.ctx = new CanvasRenderingContext2D(this.settings);
        this.setInitiallyProvidedValue(params);
        this.declareWatch("channelData", this.onDataChanged);
        this.declareWatch("channelCount", this.onDataChanged);
        this.declareWatch("canvasHeight", this.onDataChanged);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: LogicAnalyzerWaveCanvas_Params) {
        if (params.channelData === undefined) {
            this.__channelData.set([]);
        }
        if (params.channelCount === undefined) {
            this.__channelCount.set(8);
        }
        if (params.sampleCount === undefined) {
            this.__sampleCount.set(128);
        }
        if (params.canvasHeight === undefined) {
            this.__canvasHeight.set(192);
        }
        if (params.canvasW !== undefined) {
            this.canvasW = params.canvasW;
        }
        if (params.canvasH !== undefined) {
            this.canvasH = params.canvasH;
        }
        if (params.settings !== undefined) {
            this.settings = params.settings;
        }
        if (params.ctx !== undefined) {
            this.ctx = params.ctx;
        }
    }
    updateStateVars(params: LogicAnalyzerWaveCanvas_Params) {
        this.__channelData.reset(params.channelData);
        this.__channelCount.reset(params.channelCount);
        this.__sampleCount.reset(params.sampleCount);
        this.__canvasHeight.reset(params.canvasHeight);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__channelData.purgeDependencyOnElmtId(rmElmtId);
        this.__channelCount.purgeDependencyOnElmtId(rmElmtId);
        this.__sampleCount.purgeDependencyOnElmtId(rmElmtId);
        this.__canvasHeight.purgeDependencyOnElmtId(rmElmtId);
        this.__canvasW.purgeDependencyOnElmtId(rmElmtId);
        this.__canvasH.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__channelData.aboutToBeDeleted();
        this.__channelCount.aboutToBeDeleted();
        this.__sampleCount.aboutToBeDeleted();
        this.__canvasHeight.aboutToBeDeleted();
        this.__canvasW.aboutToBeDeleted();
        this.__canvasH.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __channelData: SynchedPropertySimpleOneWayPU<number[][]>;
    get channelData() {
        return this.__channelData.get();
    }
    set channelData(newValue: number[][]) {
        this.__channelData.set(newValue);
    }
    private __channelCount: SynchedPropertySimpleOneWayPU<number>;
    get channelCount() {
        return this.__channelCount.get();
    }
    set channelCount(newValue: number) {
        this.__channelCount.set(newValue);
    }
    private __sampleCount: SynchedPropertySimpleOneWayPU<number>;
    get sampleCount() {
        return this.__sampleCount.get();
    }
    set sampleCount(newValue: number) {
        this.__sampleCount.set(newValue);
    }
    private __canvasHeight: SynchedPropertySimpleOneWayPU<number>;
    get canvasHeight() {
        return this.__canvasHeight.get();
    }
    set canvasHeight(newValue: number) {
        this.__canvasHeight.set(newValue);
    }
    private __canvasW: ObservedPropertySimplePU<number>;
    get canvasW() {
        return this.__canvasW.get();
    }
    set canvasW(newValue: number) {
        this.__canvasW.set(newValue);
    }
    private __canvasH: ObservedPropertySimplePU<number>;
    get canvasH() {
        return this.__canvasH.get();
    }
    set canvasH(newValue: number) {
        this.__canvasH.set(newValue);
    }
    private settings: RenderingContextSettings;
    private ctx: CanvasRenderingContext2D;
    onDataChanged(): void {
        this.drawLogic();
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Canvas.create(this.ctx);
            Canvas.width('100%');
            Canvas.height(this.canvasHeight);
            Canvas.backgroundColor('#0a0a12');
            Canvas.onAreaChange((old: Area, newArea: Area) => {
                this.canvasW = newArea.width as number;
                this.canvasH = newArea.height as number;
                this.drawLogic();
            });
            Canvas.onAppear(() => {
                this.canvasH = this.canvasHeight;
                this.drawLogic();
            });
        }, Canvas);
        Canvas.pop();
    }
    drawLogic(): void {
        const ctx = this.ctx;
        const w = this.canvasW;
        const h = this.canvasH;
        if (w <= 0 || h <= 0)
            return;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, w, h);
        const channels = Math.min(this.channelCount, this.channelData.length);
        if (channels === 0) {
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.fillText('点击采样捕获逻辑波形', 8, h / 2 + 4);
            return;
        }
        const laneH = h / channels;
        // Grid lines
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 0.5;
        for (let ch = 0; ch < channels; ch++) {
            const y = ch * laneH;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        // Channel data
        for (let ch = 0; ch < channels; ch++) {
            const data = this.channelData[ch];
            const yBase = ch * laneH + laneH * 0.75;
            const yHigh = ch * laneH + laneH * 0.25;
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const len = Math.min(data.length, this.sampleCount);
            for (let i = 0; i < len; i++) {
                const x = (i / (len > 1 ? len - 1 : 1)) * w;
                const y = data[i] > 0 ? yHigh : yBase;
                if (i === 0)
                    ctx.moveTo(x, y);
                else
                    ctx.lineTo(x, y);
            }
            ctx.stroke();
            // Label
            ctx.fillStyle = '#808090';
            ctx.font = '8px monospace';
            ctx.fillText(`D${ch}`, 3, ch * laneH + 10);
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
