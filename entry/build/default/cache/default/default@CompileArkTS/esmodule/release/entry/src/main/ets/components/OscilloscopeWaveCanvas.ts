if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface OscilloscopeWaveCanvas_Params {
    timeData?: number[];
    voltageData?: number[];
    channelLabel?: string;
    vPerDiv?: number;
    triggerLevel?: number;
    canvasW?: number;
    canvasH?: number;
    settings?: RenderingContextSettings;
    ctx?: CanvasRenderingContext2D;
}
export class OscilloscopeWaveCanvas extends ViewPU {
    constructor(e104, f104, g104, h104 = -1, i104 = undefined, j104) {
        super(e104, g104, h104, j104);
        if (typeof i104 === "function") {
            this.paramsGenerator_ = i104;
        }
        this.__timeData = new SynchedPropertyObjectOneWayPU(f104.timeData, this, "timeData");
        this.__voltageData = new SynchedPropertyObjectOneWayPU(f104.voltageData, this, "voltageData");
        this.__channelLabel = new SynchedPropertySimpleOneWayPU(f104.channelLabel, this, "channelLabel");
        this.__vPerDiv = new SynchedPropertySimpleOneWayPU(f104.vPerDiv, this, "vPerDiv");
        this.__triggerLevel = new SynchedPropertySimpleOneWayPU(f104.triggerLevel, this, "triggerLevel");
        this.__canvasW = new ObservedPropertySimplePU(360, this, "canvasW");
        this.__canvasH = new ObservedPropertySimplePU(110, this, "canvasH");
        this.settings = new RenderingContextSettings(true);
        this.ctx = new CanvasRenderingContext2D(this.settings);
        this.setInitiallyProvidedValue(f104);
        this.declareWatch("timeData", this.onDataChanged);
        this.declareWatch("voltageData", this.onDataChanged);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(d104: OscilloscopeWaveCanvas_Params) {
        if (d104.timeData === undefined) {
            this.__timeData.set([]);
        }
        if (d104.voltageData === undefined) {
            this.__voltageData.set([]);
        }
        if (d104.channelLabel === undefined) {
            this.__channelLabel.set('CH1');
        }
        if (d104.vPerDiv === undefined) {
            this.__vPerDiv.set(1);
        }
        if (d104.triggerLevel === undefined) {
            this.__triggerLevel.set(0);
        }
        if (d104.canvasW !== undefined) {
            this.canvasW = d104.canvasW;
        }
        if (d104.canvasH !== undefined) {
            this.canvasH = d104.canvasH;
        }
        if (d104.settings !== undefined) {
            this.settings = d104.settings;
        }
        if (d104.ctx !== undefined) {
            this.ctx = d104.ctx;
        }
    }
    updateStateVars(c104: OscilloscopeWaveCanvas_Params) {
        this.__timeData.reset(c104.timeData);
        this.__voltageData.reset(c104.voltageData);
        this.__channelLabel.reset(c104.channelLabel);
        this.__vPerDiv.reset(c104.vPerDiv);
        this.__triggerLevel.reset(c104.triggerLevel);
    }
    purgeVariableDependenciesOnElmtId(b104) {
        this.__timeData.purgeDependencyOnElmtId(b104);
        this.__voltageData.purgeDependencyOnElmtId(b104);
        this.__channelLabel.purgeDependencyOnElmtId(b104);
        this.__vPerDiv.purgeDependencyOnElmtId(b104);
        this.__triggerLevel.purgeDependencyOnElmtId(b104);
        this.__canvasW.purgeDependencyOnElmtId(b104);
        this.__canvasH.purgeDependencyOnElmtId(b104);
    }
    aboutToBeDeleted() {
        this.__timeData.aboutToBeDeleted();
        this.__voltageData.aboutToBeDeleted();
        this.__channelLabel.aboutToBeDeleted();
        this.__vPerDiv.aboutToBeDeleted();
        this.__triggerLevel.aboutToBeDeleted();
        this.__canvasW.aboutToBeDeleted();
        this.__canvasH.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __timeData: SynchedPropertySimpleOneWayPU<number[]>;
    get timeData() {
        return this.__timeData.get();
    }
    set timeData(a104: number[]) {
        this.__timeData.set(a104);
    }
    private __voltageData: SynchedPropertySimpleOneWayPU<number[]>;
    get voltageData() {
        return this.__voltageData.get();
    }
    set voltageData(z103: number[]) {
        this.__voltageData.set(z103);
    }
    private __channelLabel: SynchedPropertySimpleOneWayPU<string>;
    get channelLabel() {
        return this.__channelLabel.get();
    }
    set channelLabel(y103: string) {
        this.__channelLabel.set(y103);
    }
    private __vPerDiv: SynchedPropertySimpleOneWayPU<number>;
    get vPerDiv() {
        return this.__vPerDiv.get();
    }
    set vPerDiv(x103: number) {
        this.__vPerDiv.set(x103);
    }
    private __triggerLevel: SynchedPropertySimpleOneWayPU<number>;
    get triggerLevel() {
        return this.__triggerLevel.get();
    }
    set triggerLevel(w103: number) {
        this.__triggerLevel.set(w103);
    }
    private __canvasW: ObservedPropertySimplePU<number>;
    get canvasW() {
        return this.__canvasW.get();
    }
    set canvasW(v103: number) {
        this.__canvasW.set(v103);
    }
    private __canvasH: ObservedPropertySimplePU<number>;
    get canvasH() {
        return this.__canvasH.get();
    }
    set canvasH(u103: number) {
        this.__canvasH.set(u103);
    }
    private settings: RenderingContextSettings;
    private ctx: CanvasRenderingContext2D;
    aboutToAppear(): void {
    }
    onDataChanged(): void {
        this.drawWaveform();
    }
    initialRender() {
        this.observeComponentCreation2((q103, r103) => {
            Canvas.create(this.ctx);
            Canvas.width('100%');
            Canvas.height(110);
            Canvas.backgroundColor('#0a0a12');
            Canvas.onAreaChange((s103: Area, t103: Area) => {
                this.canvasW = t103.width as number;
                this.canvasH = t103.height as number;
                this.drawWaveform();
            });
            Canvas.onAppear(() => this.drawWaveform());
        }, Canvas);
        Canvas.pop();
    }
    private drawWaveform(): void {
        const s102 = this.ctx;
        const t102 = this.canvasW;
        const u102 = this.canvasH;
        if (t102 <= 0 || u102 <= 0)
            return;
        s102.clearRect(0, 0, t102, u102);
        s102.strokeStyle = '#1a1a2e';
        s102.lineWidth = 0.5;
        const v102: number = 10;
        const w102: number = 8;
        for (let o103 = 0; o103 <= v102; o103++) {
            const p103 = (t102 / v102) * o103;
            s102.beginPath();
            s102.moveTo(p103, 0);
            s102.lineTo(p103, u102);
            s102.stroke();
        }
        for (let m103 = 0; m103 <= w102; m103++) {
            const n103 = (u102 / w102) * m103;
            s102.beginPath();
            s102.moveTo(0, n103);
            s102.lineTo(t102, n103);
            s102.stroke();
        }
        const x102 = Math.min(this.timeData.length, this.voltageData.length);
        if (x102 < 2) {
            s102.strokeStyle = '#00e676';
            s102.lineWidth = 1.5;
            s102.beginPath();
            s102.moveTo(0, u102 / 2);
            s102.lineTo(t102, u102 / 2);
            s102.stroke();
            s102.fillStyle = '#00e676';
            s102.font = '10px monospace';
            s102.fillText(this.channelLabel, 6, 14);
            return;
        }
        const y102 = Math.max(this.vPerDiv, 0.001);
        let z102 = -y102 * (w102 / 2);
        let a103 = y102 * (w102 / 2);
        for (let k103 = 0; k103 < x102; k103++) {
            const l103 = this.voltageData[k103];
            if (l103 < z102)
                z102 = l103 - y102 * 0.5;
            if (l103 > a103)
                a103 = l103 + y102 * 0.5;
        }
        const b103 = a103 - z102;
        const c103 = (z102 + a103) / 2;
        const d103 = this.timeData[0];
        const e103 = this.timeData[x102 - 1];
        const f103 = Math.max(e103 - d103, 1e-15);
        s102.strokeStyle = '#00e676';
        s102.lineWidth = 1.5;
        s102.beginPath();
        for (let h103 = 0; h103 < x102; h103++) {
            const i103 = ((this.timeData[h103] - d103) / f103) * t102;
            const j103 = u102 / 2 - ((this.voltageData[h103] - c103) / b103) * u102;
            if (h103 === 0)
                s102.moveTo(i103, j103);
            else
                s102.lineTo(i103, j103);
        }
        s102.stroke();
        if (this.triggerLevel >= z102 && this.triggerLevel <= a103) {
            const g103 = u102 / 2 - ((this.triggerLevel - c103) / b103) * u102;
            s102.strokeStyle = '#ff9100';
            s102.lineWidth = 1;
            s102.setLineDash([6, 3]);
            s102.beginPath();
            s102.moveTo(0, g103);
            s102.lineTo(t102, g103);
            s102.stroke();
            s102.setLineDash([]);
        }
        s102.fillStyle = '#00e676';
        s102.font = '10px monospace';
        s102.fillText(this.channelLabel, 6, 14);
        s102.fillStyle = '#555';
        s102.font = '8px monospace';
        s102.fillText(`${a103.toFixed(2)}V`, t102 - 48, 12);
        s102.fillText(`${z102.toFixed(2)}V`, t102 - 48, u102 - 4);
        s102.fillText(`${(d103 * 1e6).toFixed(1)}μs`, 4, u102 - 4);
        s102.fillText(`${(e103 * 1e6).toFixed(1)}μs`, t102 - 52, u102 - 4);
        s102.fillStyle = '#333';
        s102.font = '8px monospace';
        s102.fillText('0V', t102 - 20, u102 / 2 - 2);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
