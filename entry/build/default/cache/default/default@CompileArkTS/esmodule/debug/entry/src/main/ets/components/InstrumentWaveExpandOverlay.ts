if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface InstrumentWaveExpandOverlay_Params {
    refreshTick?: number;
    onClose?: () => void;
    title?: string;
    detail?: string;
    kind?: string;
    frameId?: number;
    timeData?: number[];
    voltageData?: number[];
    timeData2?: number[];
    voltageData2?: number[];
    showCh2?: boolean;
    channelLabel?: string;
    waveColor?: string;
    ch2Label?: string;
    ch2Color?: string;
    vPerDiv?: number;
    tPerDiv?: number;
    triggerLevel?: number;
    autoFit?: boolean;
    freqDomain?: boolean;
    channelData?: number[][];
    channelCount?: number;
    sampleCount?: number;
    viewZoom?: number;
    viewPanSec?: number;
    panStartSec?: number;
    pinchStartZoom?: number;
}
import { ProteusClassicBtn } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { OscilloscopeWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/OscilloscopeWaveCanvas";
import { LogicAnalyzerWaveCanvas } from "@bundle:com.elecdraw.aischsim/entry/ets/components/LogicAnalyzerWaveCanvas";
import { InstrumentWaveExpandStore } from "@bundle:com.elecdraw.aischsim/entry/ets/components/InstrumentWaveExpandStore";
export class InstrumentWaveExpandOverlay extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__refreshTick = new SynchedPropertySimpleOneWayPU(params.refreshTick, this, "refreshTick");
        this.onClose = () => { };
        this.__title = new ObservedPropertySimplePU('', this, "title");
        this.__detail = new ObservedPropertySimplePU('', this, "detail");
        this.__kind = new ObservedPropertySimplePU('osc', this, "kind");
        this.__frameId = new ObservedPropertySimplePU(0, this, "frameId");
        this.__timeData = new ObservedPropertyObjectPU([], this, "timeData");
        this.__voltageData = new ObservedPropertyObjectPU([], this, "voltageData");
        this.__timeData2 = new ObservedPropertyObjectPU([], this, "timeData2");
        this.__voltageData2 = new ObservedPropertyObjectPU([], this, "voltageData2");
        this.__showCh2 = new ObservedPropertySimplePU(false, this, "showCh2");
        this.__channelLabel = new ObservedPropertySimplePU('CH1', this, "channelLabel");
        this.__waveColor = new ObservedPropertySimplePU('#00e676', this, "waveColor");
        this.__ch2Label = new ObservedPropertySimplePU('CH2', this, "ch2Label");
        this.__ch2Color = new ObservedPropertySimplePU('#40c4ff', this, "ch2Color");
        this.__vPerDiv = new ObservedPropertySimplePU(1, this, "vPerDiv");
        this.__tPerDiv = new ObservedPropertySimplePU(1e-3, this, "tPerDiv");
        this.__triggerLevel = new ObservedPropertySimplePU(0, this, "triggerLevel");
        this.__autoFit = new ObservedPropertySimplePU(true, this, "autoFit");
        this.__freqDomain = new ObservedPropertySimplePU(false, this, "freqDomain");
        this.__channelData = new ObservedPropertyObjectPU([], this, "channelData");
        this.__channelCount = new ObservedPropertySimplePU(8, this, "channelCount");
        this.__sampleCount = new ObservedPropertySimplePU(128, this, "sampleCount");
        this.__viewZoom = new ObservedPropertySimplePU(1, this, "viewZoom");
        this.__viewPanSec = new ObservedPropertySimplePU(0, this, "viewPanSec");
        this.panStartSec = 0;
        this.pinchStartZoom = 1;
        this.setInitiallyProvidedValue(params);
        this.declareWatch("refreshTick", this.onRefreshTick);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: InstrumentWaveExpandOverlay_Params) {
        if (params.refreshTick === undefined) {
            this.__refreshTick.set(0);
        }
        if (params.onClose !== undefined) {
            this.onClose = params.onClose;
        }
        if (params.title !== undefined) {
            this.title = params.title;
        }
        if (params.detail !== undefined) {
            this.detail = params.detail;
        }
        if (params.kind !== undefined) {
            this.kind = params.kind;
        }
        if (params.frameId !== undefined) {
            this.frameId = params.frameId;
        }
        if (params.timeData !== undefined) {
            this.timeData = params.timeData;
        }
        if (params.voltageData !== undefined) {
            this.voltageData = params.voltageData;
        }
        if (params.timeData2 !== undefined) {
            this.timeData2 = params.timeData2;
        }
        if (params.voltageData2 !== undefined) {
            this.voltageData2 = params.voltageData2;
        }
        if (params.showCh2 !== undefined) {
            this.showCh2 = params.showCh2;
        }
        if (params.channelLabel !== undefined) {
            this.channelLabel = params.channelLabel;
        }
        if (params.waveColor !== undefined) {
            this.waveColor = params.waveColor;
        }
        if (params.ch2Label !== undefined) {
            this.ch2Label = params.ch2Label;
        }
        if (params.ch2Color !== undefined) {
            this.ch2Color = params.ch2Color;
        }
        if (params.vPerDiv !== undefined) {
            this.vPerDiv = params.vPerDiv;
        }
        if (params.tPerDiv !== undefined) {
            this.tPerDiv = params.tPerDiv;
        }
        if (params.triggerLevel !== undefined) {
            this.triggerLevel = params.triggerLevel;
        }
        if (params.autoFit !== undefined) {
            this.autoFit = params.autoFit;
        }
        if (params.freqDomain !== undefined) {
            this.freqDomain = params.freqDomain;
        }
        if (params.channelData !== undefined) {
            this.channelData = params.channelData;
        }
        if (params.channelCount !== undefined) {
            this.channelCount = params.channelCount;
        }
        if (params.sampleCount !== undefined) {
            this.sampleCount = params.sampleCount;
        }
        if (params.viewZoom !== undefined) {
            this.viewZoom = params.viewZoom;
        }
        if (params.viewPanSec !== undefined) {
            this.viewPanSec = params.viewPanSec;
        }
        if (params.panStartSec !== undefined) {
            this.panStartSec = params.panStartSec;
        }
        if (params.pinchStartZoom !== undefined) {
            this.pinchStartZoom = params.pinchStartZoom;
        }
    }
    updateStateVars(params: InstrumentWaveExpandOverlay_Params) {
        this.__refreshTick.reset(params.refreshTick);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__refreshTick.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
        this.__detail.purgeDependencyOnElmtId(rmElmtId);
        this.__kind.purgeDependencyOnElmtId(rmElmtId);
        this.__frameId.purgeDependencyOnElmtId(rmElmtId);
        this.__timeData.purgeDependencyOnElmtId(rmElmtId);
        this.__voltageData.purgeDependencyOnElmtId(rmElmtId);
        this.__timeData2.purgeDependencyOnElmtId(rmElmtId);
        this.__voltageData2.purgeDependencyOnElmtId(rmElmtId);
        this.__showCh2.purgeDependencyOnElmtId(rmElmtId);
        this.__channelLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__waveColor.purgeDependencyOnElmtId(rmElmtId);
        this.__ch2Label.purgeDependencyOnElmtId(rmElmtId);
        this.__ch2Color.purgeDependencyOnElmtId(rmElmtId);
        this.__vPerDiv.purgeDependencyOnElmtId(rmElmtId);
        this.__tPerDiv.purgeDependencyOnElmtId(rmElmtId);
        this.__triggerLevel.purgeDependencyOnElmtId(rmElmtId);
        this.__autoFit.purgeDependencyOnElmtId(rmElmtId);
        this.__freqDomain.purgeDependencyOnElmtId(rmElmtId);
        this.__channelData.purgeDependencyOnElmtId(rmElmtId);
        this.__channelCount.purgeDependencyOnElmtId(rmElmtId);
        this.__sampleCount.purgeDependencyOnElmtId(rmElmtId);
        this.__viewZoom.purgeDependencyOnElmtId(rmElmtId);
        this.__viewPanSec.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__refreshTick.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        this.__detail.aboutToBeDeleted();
        this.__kind.aboutToBeDeleted();
        this.__frameId.aboutToBeDeleted();
        this.__timeData.aboutToBeDeleted();
        this.__voltageData.aboutToBeDeleted();
        this.__timeData2.aboutToBeDeleted();
        this.__voltageData2.aboutToBeDeleted();
        this.__showCh2.aboutToBeDeleted();
        this.__channelLabel.aboutToBeDeleted();
        this.__waveColor.aboutToBeDeleted();
        this.__ch2Label.aboutToBeDeleted();
        this.__ch2Color.aboutToBeDeleted();
        this.__vPerDiv.aboutToBeDeleted();
        this.__tPerDiv.aboutToBeDeleted();
        this.__triggerLevel.aboutToBeDeleted();
        this.__autoFit.aboutToBeDeleted();
        this.__freqDomain.aboutToBeDeleted();
        this.__channelData.aboutToBeDeleted();
        this.__channelCount.aboutToBeDeleted();
        this.__sampleCount.aboutToBeDeleted();
        this.__viewZoom.aboutToBeDeleted();
        this.__viewPanSec.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __refreshTick: SynchedPropertySimpleOneWayPU<number>;
    get refreshTick() {
        return this.__refreshTick.get();
    }
    set refreshTick(newValue: number) {
        this.__refreshTick.set(newValue);
    }
    private onClose: () => void;
    private __title: ObservedPropertySimplePU<string>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: string) {
        this.__title.set(newValue);
    }
    private __detail: ObservedPropertySimplePU<string>;
    get detail() {
        return this.__detail.get();
    }
    set detail(newValue: string) {
        this.__detail.set(newValue);
    }
    private __kind: ObservedPropertySimplePU<string>;
    get kind() {
        return this.__kind.get();
    }
    set kind(newValue: string) {
        this.__kind.set(newValue);
    }
    private __frameId: ObservedPropertySimplePU<number>;
    get frameId() {
        return this.__frameId.get();
    }
    set frameId(newValue: number) {
        this.__frameId.set(newValue);
    }
    private __timeData: ObservedPropertyObjectPU<number[]>;
    get timeData() {
        return this.__timeData.get();
    }
    set timeData(newValue: number[]) {
        this.__timeData.set(newValue);
    }
    private __voltageData: ObservedPropertyObjectPU<number[]>;
    get voltageData() {
        return this.__voltageData.get();
    }
    set voltageData(newValue: number[]) {
        this.__voltageData.set(newValue);
    }
    private __timeData2: ObservedPropertyObjectPU<number[]>;
    get timeData2() {
        return this.__timeData2.get();
    }
    set timeData2(newValue: number[]) {
        this.__timeData2.set(newValue);
    }
    private __voltageData2: ObservedPropertyObjectPU<number[]>;
    get voltageData2() {
        return this.__voltageData2.get();
    }
    set voltageData2(newValue: number[]) {
        this.__voltageData2.set(newValue);
    }
    private __showCh2: ObservedPropertySimplePU<boolean>;
    get showCh2() {
        return this.__showCh2.get();
    }
    set showCh2(newValue: boolean) {
        this.__showCh2.set(newValue);
    }
    private __channelLabel: ObservedPropertySimplePU<string>;
    get channelLabel() {
        return this.__channelLabel.get();
    }
    set channelLabel(newValue: string) {
        this.__channelLabel.set(newValue);
    }
    private __waveColor: ObservedPropertySimplePU<string>;
    get waveColor() {
        return this.__waveColor.get();
    }
    set waveColor(newValue: string) {
        this.__waveColor.set(newValue);
    }
    private __ch2Label: ObservedPropertySimplePU<string>;
    get ch2Label() {
        return this.__ch2Label.get();
    }
    set ch2Label(newValue: string) {
        this.__ch2Label.set(newValue);
    }
    private __ch2Color: ObservedPropertySimplePU<string>;
    get ch2Color() {
        return this.__ch2Color.get();
    }
    set ch2Color(newValue: string) {
        this.__ch2Color.set(newValue);
    }
    private __vPerDiv: ObservedPropertySimplePU<number>;
    get vPerDiv() {
        return this.__vPerDiv.get();
    }
    set vPerDiv(newValue: number) {
        this.__vPerDiv.set(newValue);
    }
    private __tPerDiv: ObservedPropertySimplePU<number>;
    get tPerDiv() {
        return this.__tPerDiv.get();
    }
    set tPerDiv(newValue: number) {
        this.__tPerDiv.set(newValue);
    }
    private __triggerLevel: ObservedPropertySimplePU<number>;
    get triggerLevel() {
        return this.__triggerLevel.get();
    }
    set triggerLevel(newValue: number) {
        this.__triggerLevel.set(newValue);
    }
    private __autoFit: ObservedPropertySimplePU<boolean>;
    get autoFit() {
        return this.__autoFit.get();
    }
    set autoFit(newValue: boolean) {
        this.__autoFit.set(newValue);
    }
    private __freqDomain: ObservedPropertySimplePU<boolean>;
    get freqDomain() {
        return this.__freqDomain.get();
    }
    set freqDomain(newValue: boolean) {
        this.__freqDomain.set(newValue);
    }
    private __channelData: ObservedPropertyObjectPU<number[][]>;
    get channelData() {
        return this.__channelData.get();
    }
    set channelData(newValue: number[][]) {
        this.__channelData.set(newValue);
    }
    private __channelCount: ObservedPropertySimplePU<number>;
    get channelCount() {
        return this.__channelCount.get();
    }
    set channelCount(newValue: number) {
        this.__channelCount.set(newValue);
    }
    private __sampleCount: ObservedPropertySimplePU<number>;
    get sampleCount() {
        return this.__sampleCount.get();
    }
    set sampleCount(newValue: number) {
        this.__sampleCount.set(newValue);
    }
    private __viewZoom: ObservedPropertySimplePU<number>;
    get viewZoom() {
        return this.__viewZoom.get();
    }
    set viewZoom(newValue: number) {
        this.__viewZoom.set(newValue);
    }
    private __viewPanSec: ObservedPropertySimplePU<number>;
    get viewPanSec() {
        return this.__viewPanSec.get();
    }
    set viewPanSec(newValue: number) {
        this.__viewPanSec.set(newValue);
    }
    private panStartSec: number;
    private pinchStartZoom: number;
    aboutToAppear(): void {
        this.pullFromStore();
    }
    onRefreshTick(): void {
        this.pullFromStore();
    }
    private pullFromStore(): void {
        const s = InstrumentWaveExpandStore.getInstance();
        this.title = s.title;
        this.detail = s.detail;
        this.kind = s.kind;
        this.frameId = s.frameId;
        this.timeData = s.timeData.slice();
        this.voltageData = s.voltageData.slice();
        this.timeData2 = s.timeData2.slice();
        this.voltageData2 = s.voltageData2.slice();
        this.showCh2 = s.showCh2;
        this.channelLabel = s.channelLabel;
        this.waveColor = s.waveColor;
        this.ch2Label = s.ch2Label;
        this.ch2Color = s.ch2Color;
        this.vPerDiv = s.vPerDiv;
        this.tPerDiv = s.tPerDiv;
        this.triggerLevel = s.triggerLevel;
        this.autoFit = s.autoFit;
        this.freqDomain = s.freqDomain;
        this.channelCount = s.channelCount;
        this.sampleCount = s.sampleCount;
        const chCopy: number[][] = [];
        for (let i = 0; i < s.channelData.length; i++) {
            chCopy.push(s.channelData[i].slice());
        }
        this.channelData = chCopy;
        this.viewPanSec = this.clampPan(this.viewPanSec);
    }
    private close(): void {
        InstrumentWaveExpandStore.getInstance().close();
        this.onClose();
    }
    private getWindowSpan(): number {
        return Math.max(this.tPerDiv * 10 / Math.max(this.viewZoom, 0.05), 1e-12);
    }
    private getMaxPanSec(): number {
        const n = Math.min(this.timeData.length, this.voltageData.length);
        if (n < 2) {
            return 0;
        }
        const hist = Math.max(this.timeData[n - 1] - this.timeData[0], 0);
        return Math.max(hist - this.getWindowSpan(), 0);
    }
    private clampPan(next: number): number {
        let v = next;
        if (v < 0) {
            v = 0;
        }
        const maxPan = this.getMaxPanSec();
        if (v > maxPan) {
            v = maxPan;
        }
        return v;
    }
    private applyZoom(z: number): void {
        let next = z;
        if (next < 0.25) {
            next = 0.25;
        }
        if (next > 16) {
            next = 16;
        }
        this.viewZoom = next;
        this.viewPanSec = this.clampPan(this.viewPanSec);
    }
    private zoomIn(): void {
        this.applyZoom(this.viewZoom * 1.4);
    }
    private zoomOut(): void {
        this.applyZoom(this.viewZoom / 1.4);
    }
    private resetView(): void {
        this.viewZoom = 1;
        this.viewPanSec = 0;
    }
    private panByFraction(frac: number): void {
        const span = this.getWindowSpan();
        this.viewPanSec = this.clampPan(this.viewPanSec + frac * span);
    }
    private setPanFromSlider(norm: number): void {
        // 滑杆左=历史(回看)，右=最新(跟随)
        const maxPan = this.getMaxPanSec();
        const t = Math.max(0, Math.min(1000, norm)) / 1000;
        this.viewPanSec = this.clampPan((1 - t) * maxPan);
    }
    private panSliderValue(): number {
        const maxPan = this.getMaxPanSec();
        if (maxPan <= 1e-15) {
            return 1000;
        }
        return Math.max(0, Math.min(1000, (1 - this.viewPanSec / maxPan) * 1000));
    }
    private handleAxisZoom(event: AxisEvent): void {
        if (this.kind === 'la') {
            return;
        }
        const v = event.getVerticalAxisValue();
        if (v === 0) {
            return;
        }
        // 滚轮向前(负)放大，向后(正)缩小
        const factor = v < 0 ? 1.15 : (1 / 1.15);
        this.applyZoom(this.viewZoom * factor);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#000000B0');
            Column.onClick(() => {
                this.close();
            });
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 10 });
            Column.width('92%');
            Column.height('88%');
            Column.padding(16);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.DIVIDER });
            Column.shadow({ radius: 16, color: '#00000080' });
            Column.focusable(true);
            Column.onAxisEvent((event: AxisEvent) => {
                this.handleAxisZoom(event);
            });
            Column.onClick(() => {
                // 吞掉点击，避免点到内容区关闭
            });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title.length > 0 ? this.title : '波形详情');
            Text.fontSize(18);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`#${this.refreshTick}`);
            Text.fontSize(12);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.fontFamily('monospace');
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '关闭',
                        widthVal: 64,
                        onAction: () => {
                            this.close();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 193, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '关闭',
                            widthVal: 64,
                            onAction: () => {
                                this.close();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '关闭',
                        widthVal: 64
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.kind !== 'la') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 6 });
                        Row.width('100%');
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '放大',
                                    widthVal: 56,
                                    onAction: () => {
                                        this.zoomIn();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 205, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '放大',
                                        widthVal: 56,
                                        onAction: () => {
                                            this.zoomIn();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '放大',
                                    widthVal: 56
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '缩小',
                                    widthVal: 56,
                                    onAction: () => {
                                        this.zoomOut();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 212, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '缩小',
                                        widthVal: 56,
                                        onAction: () => {
                                            this.zoomOut();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '缩小',
                                    widthVal: 56
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '←',
                                    widthVal: 40,
                                    onAction: () => {
                                        this.panByFraction(0.35);
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 219, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '←',
                                        widthVal: 40,
                                        onAction: () => {
                                            this.panByFraction(0.35);
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '←',
                                    widthVal: 40
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '→',
                                    widthVal: 40,
                                    onAction: () => {
                                        this.panByFraction(-0.35);
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 226, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '→',
                                        widthVal: 40,
                                        onAction: () => {
                                            this.panByFraction(-0.35);
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '→',
                                    widthVal: 40
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '复位',
                                    widthVal: 56,
                                    onAction: () => {
                                        this.resetView();
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 233, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '复位',
                                        widthVal: 56,
                                        onAction: () => {
                                            this.resetView();
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '复位',
                                    widthVal: 56
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`×${this.viewZoom.toFixed(1)}  pan=${this.viewPanSec.toExponential(1)}s`);
                        Text.fontSize(12);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.fontFamily('monospace');
                        Text.layoutWeight(1);
                    }, Text);
                    Text.pop();
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.layoutWeight(1);
            Scroll.width('100%');
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.kind === 'la') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new LogicAnalyzerWaveCanvas(this, {
                                    channelData: this.channelData,
                                    channelCount: this.channelCount,
                                    sampleCount: this.sampleCount,
                                    canvasHeight: 420
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 252, col: 15 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        channelData: this.channelData,
                                        channelCount: this.channelCount,
                                        sampleCount: this.sampleCount,
                                        canvasHeight: 420
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    channelData: this.channelData,
                                    channelCount: this.channelCount,
                                    sampleCount: this.sampleCount,
                                    canvasHeight: 420
                                });
                            }
                        }, { name: "LogicAnalyzerWaveCanvas" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.focusable(true);
                        Column.onAxisEvent((event: AxisEvent) => {
                            this.handleAxisZoom(event);
                        });
                        globalThis.Gesture.create(GesturePriority.Low);
                        GestureGroup.create(GestureMode.Exclusive);
                        PinchGesture.create({ fingers: 2 });
                        PinchGesture.onActionStart(() => {
                            this.pinchStartZoom = this.viewZoom;
                        });
                        PinchGesture.onActionUpdate((e: GestureEvent) => {
                            const s = e.scale;
                            if (!Number.isFinite(s) || s <= 0.05) {
                                return;
                            }
                            this.applyZoom(this.pinchStartZoom * s);
                        });
                        PinchGesture.pop();
                        PanGesture.create({ direction: PanDirection.Horizontal, distance: 4 });
                        PanGesture.onActionStart(() => {
                            this.panStartSec = this.viewPanSec;
                        });
                        PanGesture.onActionUpdate((e: GestureEvent) => {
                            const span = this.getWindowSpan();
                            // 右拖看更新（减小 pan）；左拖看历史（增大 pan）
                            const deltaSec = (-e.offsetX / 360) * span;
                            this.viewPanSec = this.clampPan(this.panStartSec + deltaSec);
                        });
                        PanGesture.pop();
                        GestureGroup.pop();
                        globalThis.Gesture.pop();
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new OscilloscopeWaveCanvas(this, {
                                    timeData: this.timeData,
                                    voltageData: this.voltageData,
                                    frameId: this.frameId,
                                    channelLabel: this.channelLabel,
                                    waveColor: this.waveColor,
                                    vPerDiv: this.vPerDiv,
                                    tPerDiv: this.tPerDiv,
                                    triggerLevel: this.triggerLevel,
                                    autoFit: this.autoFit,
                                    freqDomain: this.freqDomain,
                                    canvasHeight: this.showCh2 ? 280 : 380,
                                    showStats: true,
                                    viewZoom: this.viewZoom,
                                    viewPanSec: this.viewPanSec
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 261, col: 17 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        timeData: this.timeData,
                                        voltageData: this.voltageData,
                                        frameId: this.frameId,
                                        channelLabel: this.channelLabel,
                                        waveColor: this.waveColor,
                                        vPerDiv: this.vPerDiv,
                                        tPerDiv: this.tPerDiv,
                                        triggerLevel: this.triggerLevel,
                                        autoFit: this.autoFit,
                                        freqDomain: this.freqDomain,
                                        canvasHeight: this.showCh2 ? 280 : 380,
                                        showStats: true,
                                        viewZoom: this.viewZoom,
                                        viewPanSec: this.viewPanSec
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    timeData: this.timeData,
                                    voltageData: this.voltageData,
                                    frameId: this.frameId,
                                    channelLabel: this.channelLabel,
                                    waveColor: this.waveColor,
                                    vPerDiv: this.vPerDiv,
                                    tPerDiv: this.tPerDiv,
                                    triggerLevel: this.triggerLevel,
                                    autoFit: this.autoFit,
                                    freqDomain: this.freqDomain,
                                    canvasHeight: this.showCh2 ? 280 : 380,
                                    showStats: true,
                                    viewZoom: this.viewZoom,
                                    viewPanSec: this.viewPanSec
                                });
                            }
                        }, { name: "OscilloscopeWaveCanvas" });
                    }
                    __Common__.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        If.create();
                        if (this.showCh2 && this.voltageData2.length > 1) {
                            this.ifElseBranchUpdateFunction(0, () => {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    __Common__.create();
                                    __Common__.width('100%');
                                }, __Common__);
                                {
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        if (isInitialRender) {
                                            let componentCall = new OscilloscopeWaveCanvas(this, {
                                                timeData: this.timeData2.length > 1 ? this.timeData2 : this.timeData,
                                                voltageData: this.voltageData2,
                                                frameId: this.frameId,
                                                channelLabel: this.ch2Label,
                                                waveColor: this.ch2Color,
                                                vPerDiv: this.vPerDiv,
                                                tPerDiv: this.tPerDiv,
                                                triggerLevel: this.triggerLevel,
                                                autoFit: this.autoFit,
                                                freqDomain: this.freqDomain,
                                                canvasHeight: 280,
                                                showStats: true,
                                                viewZoom: this.viewZoom,
                                                viewPanSec: this.viewPanSec
                                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/InstrumentWaveExpandOverlay.ets", line: 279, col: 19 });
                                            ViewPU.create(componentCall);
                                            let paramsLambda = () => {
                                                return {
                                                    timeData: this.timeData2.length > 1 ? this.timeData2 : this.timeData,
                                                    voltageData: this.voltageData2,
                                                    frameId: this.frameId,
                                                    channelLabel: this.ch2Label,
                                                    waveColor: this.ch2Color,
                                                    vPerDiv: this.vPerDiv,
                                                    tPerDiv: this.tPerDiv,
                                                    triggerLevel: this.triggerLevel,
                                                    autoFit: this.autoFit,
                                                    freqDomain: this.freqDomain,
                                                    canvasHeight: 280,
                                                    showStats: true,
                                                    viewZoom: this.viewZoom,
                                                    viewPanSec: this.viewPanSec
                                                };
                                            };
                                            componentCall.paramsGenerator_ = paramsLambda;
                                        }
                                        else {
                                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                                timeData: this.timeData2.length > 1 ? this.timeData2 : this.timeData,
                                                voltageData: this.voltageData2,
                                                frameId: this.frameId,
                                                channelLabel: this.ch2Label,
                                                waveColor: this.ch2Color,
                                                vPerDiv: this.vPerDiv,
                                                tPerDiv: this.tPerDiv,
                                                triggerLevel: this.triggerLevel,
                                                autoFit: this.autoFit,
                                                freqDomain: this.freqDomain,
                                                canvasHeight: 280,
                                                showStats: true,
                                                viewZoom: this.viewZoom,
                                                viewPanSec: this.viewPanSec
                                            });
                                        }
                                    }, { name: "OscilloscopeWaveCanvas" });
                                }
                                __Common__.pop();
                            });
                        }
                        else {
                            this.ifElseBranchUpdateFunction(1, () => {
                            });
                        }
                    }, If);
                    If.pop();
                    Column.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.kind !== 'la') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 8 });
                        Row.width('100%');
                        Row.padding({ top: 4, bottom: 2 });
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('历史');
                        Text.fontSize(12);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width(36);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Slider.create({
                            value: this.panSliderValue(),
                            min: 0,
                            max: 1000,
                            step: 1
                        });
                        Slider.layoutWeight(1);
                        Slider.enabled(this.getMaxPanSec() > 1e-15);
                        Slider.onChange((v: number) => {
                            this.setPanFromSlider(v);
                        });
                    }, Slider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('最新');
                        Text.fontSize(12);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width(36);
                    }, Text);
                    Text.pop();
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.kind === 'la'
                ? '逻辑波形'
                : '滚轮缩放 · 底部滑杆左右平移 · 亦可拖动/双指缩放');
            Text.fontSize(12);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.detail.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.detail);
                        Text.fontSize(15);
                        Text.fontColor(ProteusColors.HOVER_PREVIEW);
                        Text.fontFamily('monospace');
                        Text.width('100%');
                        Text.maxLines(20);
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('本次仿真尚无波形数据。启动仿真后双击侧栏波形可查看详情。');
                        Text.fontSize(14);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
        Scroll.pop();
        Column.pop();
        Stack.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
