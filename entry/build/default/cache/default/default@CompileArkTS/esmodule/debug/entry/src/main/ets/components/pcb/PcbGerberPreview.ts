if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbGerberPreview_Params {
    themeRev?: number;
    docRev?: number;
    getDocument?: () => PcbDocument | null;
    onExport?: () => void;
    settings?: RenderingContextSettings;
    ctx?: CanvasRenderingContext2D;
    fileNames?: string[];
    layerTitles?: string[];
    selectedIdx?: number;
    statusText?: string;
    previewKey?: number;
    viewW?: number;
    viewH?: number;
}
import { PcbLayerId, PcbPadType, padWorldPosition, copperLayersFromStack, exportPcbGerber } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbPad, Point2D, GerberLayerFile } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusClassicBtn, ProteusPanelTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
function padOnCopperLayer(pad: PcbPad, layerId: PcbLayerId): boolean {
    if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH)
        return true;
    if (!pad.layers || pad.layers.length === 0) {
        return layerId === PcbLayerId.F_CU;
    }
    for (let i = 0; i < pad.layers.length; i++) {
        if (pad.layers[i] === layerId)
            return true;
    }
    return false;
}
function isFrontSideTitle(title: string): boolean {
    const t = title.toLowerCase();
    if (t.indexOf('b.') >= 0 || t.indexOf('back') >= 0 || t.indexOf('bottom') >= 0)
        return false;
    return true;
}
export class PcbGerberPreview extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__docRev = new SynchedPropertySimpleOneWayPU(params.docRev, this, "docRev");
        this.getDocument = () => null;
        this.onExport = () => { };
        this.settings = new RenderingContextSettings(true);
        this.ctx = new CanvasRenderingContext2D(this.settings);
        this.__fileNames = new ObservedPropertyObjectPU([], this, "fileNames");
        this.__layerTitles = new ObservedPropertyObjectPU([], this, "layerTitles");
        this.__selectedIdx = new ObservedPropertySimplePU(0, this, "selectedIdx");
        this.__statusText = new ObservedPropertySimplePU('', this, "statusText");
        this.__previewKey = new ObservedPropertySimplePU(0, this, "previewKey");
        this.viewW = 240;
        this.viewH = 200;
        this.setInitiallyProvidedValue(params);
        this.declareWatch("docRev", this.onDocRev);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbGerberPreview_Params) {
        if (params.docRev === undefined) {
            this.__docRev.set(0);
        }
        if (params.getDocument !== undefined) {
            this.getDocument = params.getDocument;
        }
        if (params.onExport !== undefined) {
            this.onExport = params.onExport;
        }
        if (params.settings !== undefined) {
            this.settings = params.settings;
        }
        if (params.ctx !== undefined) {
            this.ctx = params.ctx;
        }
        if (params.fileNames !== undefined) {
            this.fileNames = params.fileNames;
        }
        if (params.layerTitles !== undefined) {
            this.layerTitles = params.layerTitles;
        }
        if (params.selectedIdx !== undefined) {
            this.selectedIdx = params.selectedIdx;
        }
        if (params.statusText !== undefined) {
            this.statusText = params.statusText;
        }
        if (params.previewKey !== undefined) {
            this.previewKey = params.previewKey;
        }
        if (params.viewW !== undefined) {
            this.viewW = params.viewW;
        }
        if (params.viewH !== undefined) {
            this.viewH = params.viewH;
        }
    }
    updateStateVars(params: PcbGerberPreview_Params) {
        this.__docRev.reset(params.docRev);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__docRev.purgeDependencyOnElmtId(rmElmtId);
        this.__fileNames.purgeDependencyOnElmtId(rmElmtId);
        this.__layerTitles.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__statusText.purgeDependencyOnElmtId(rmElmtId);
        this.__previewKey.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__docRev.aboutToBeDeleted();
        this.__fileNames.aboutToBeDeleted();
        this.__layerTitles.aboutToBeDeleted();
        this.__selectedIdx.aboutToBeDeleted();
        this.__statusText.aboutToBeDeleted();
        this.__previewKey.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __docRev: SynchedPropertySimpleOneWayPU<number>;
    get docRev() {
        return this.__docRev.get();
    }
    set docRev(newValue: number) {
        this.__docRev.set(newValue);
    }
    private getDocument: () => PcbDocument | null;
    private onExport: () => void;
    private settings: RenderingContextSettings;
    private ctx: CanvasRenderingContext2D;
    private __fileNames: ObservedPropertyObjectPU<string[]>;
    get fileNames() {
        return this.__fileNames.get();
    }
    set fileNames(newValue: string[]) {
        this.__fileNames.set(newValue);
    }
    private __layerTitles: ObservedPropertyObjectPU<string[]>;
    get layerTitles() {
        return this.__layerTitles.get();
    }
    set layerTitles(newValue: string[]) {
        this.__layerTitles.set(newValue);
    }
    private __selectedIdx: ObservedPropertySimplePU<number>;
    get selectedIdx() {
        return this.__selectedIdx.get();
    }
    set selectedIdx(newValue: number) {
        this.__selectedIdx.set(newValue);
    }
    private __statusText: ObservedPropertySimplePU<string>;
    get statusText() {
        return this.__statusText.get();
    }
    set statusText(newValue: string) {
        this.__statusText.set(newValue);
    }
    private __previewKey: ObservedPropertySimplePU<number>;
    get previewKey() {
        return this.__previewKey.get();
    }
    set previewKey(newValue: number) {
        this.__previewKey.set(newValue);
    }
    private viewW: number;
    private viewH: number;
    onDocRev(): void {
        this.refreshFileList();
        this.previewKey++;
        this.scheduleDraw();
    }
    aboutToAppear(): void {
        this.refreshFileList();
    }
    private refreshFileList(): void {
        const doc = this.getDocument();
        if (!doc) {
            this.fileNames = [];
            this.layerTitles = [];
            this.statusText = '无 PCB 文档';
            return;
        }
        const result = exportPcbGerber(doc);
        const names: string[] = [];
        const titles: string[] = [];
        for (let i = 0; i < result.files.length; i++) {
            const f: GerberLayerFile = result.files[i];
            if (f.fileName.endsWith('.txt') && f.fileName.indexOf('README') >= 0)
                continue;
            names.push(f.fileName);
            titles.push(f.layerName);
        }
        this.fileNames = names;
        this.layerTitles = titles;
        if (this.selectedIdx >= names.length) {
            this.selectedIdx = 0;
        }
        this.statusText = `${names.length} 个 Gerber/Drill 文件`;
    }
    private scheduleDraw(): void {
        setTimeout(() => {
            this.drawPreview();
        }, 16);
    }
    private drawPreview(): void {
        const doc = this.getDocument();
        const c = this.ctx;
        c.clearRect(0, 0, this.viewW, this.viewH);
        c.fillStyle = '#0A0C10';
        c.fillRect(0, 0, this.viewW, this.viewH);
        if (!doc || this.fileNames.length === 0) {
            c.fillStyle = '#8899AA';
            c.font = '11px sans-serif';
            c.fillText('无预览', 12, 24);
            return;
        }
        const title = this.layerTitles[this.selectedIdx] ?? '';
        const fname = this.fileNames[this.selectedIdx] ?? '';
        const kind = this.classifyLayer(title, fname);
        // Fit board
        const pts = doc.boardOutline.points;
        let minX = 0;
        let minY = 0;
        let maxX = 1000;
        let maxY = 800;
        if (pts.length > 0) {
            minX = pts[0].x;
            minY = pts[0].y;
            maxX = pts[0].x;
            maxY = pts[0].y;
            for (let i = 1; i < pts.length; i++) {
                if (pts[i].x < minX)
                    minX = pts[i].x;
                if (pts[i].y < minY)
                    minY = pts[i].y;
                if (pts[i].x > maxX)
                    maxX = pts[i].x;
                if (pts[i].y > maxY)
                    maxY = pts[i].y;
            }
        }
        const bw = Math.max(1, maxX - minX);
        const bh = Math.max(1, maxY - minY);
        const pad = 16;
        const zoom = Math.min((this.viewW - pad * 2) / bw, (this.viewH - pad * 2 - 20) / bh);
        const ox = pad - minX * zoom;
        const oy = pad + 18 - minY * zoom;
        const toS = (w: Point2D): Point2D => ({ x: w.x * zoom + ox, y: w.y * zoom + oy });
        // Board
        if (pts.length >= 2) {
            c.strokeStyle = '#E8A020';
            c.lineWidth = 1.5;
            c.beginPath();
            const p0 = toS(pts[0]);
            c.moveTo(p0.x, p0.y);
            for (let i = 1; i < pts.length; i++) {
                const p = toS(pts[i]);
                c.lineTo(p.x, p.y);
            }
            c.closePath();
            c.stroke();
        }
        if (kind === 'copper') {
            const layerId = this.copperIdFromTitle(title, doc);
            c.strokeStyle = layerId === PcbLayerId.B_CU ? '#00C853' : '#FF2A2A';
            c.lineWidth = Math.max(1, 8 * zoom);
            c.lineCap = 'round';
            for (const trk of doc.tracks) {
                if (trk.layer !== layerId)
                    continue;
                const a = toS(trk.start);
                const b = toS(trk.end);
                c.beginPath();
                c.moveTo(a.x, a.y);
                c.lineTo(b.x, b.y);
                c.stroke();
            }
            c.fillStyle = '#E8C040';
            for (const fp of doc.footprints) {
                for (const pad of fp.pads) {
                    if (!padOnCopperLayer(pad, layerId))
                        continue;
                    const w = padWorldPosition(fp, pad);
                    const p = toS(w);
                    const r = Math.max(1.5, Math.max(pad.size.x, pad.size.y) * zoom / 2);
                    c.beginPath();
                    c.arc(p.x, p.y, r, 0, Math.PI * 2);
                    c.fill();
                }
            }
            for (const z of doc.zones) {
                if (z.layer !== layerId || z.outline.length < 3)
                    continue;
                c.fillStyle = 'rgba(255,80,80,0.25)';
                c.beginPath();
                const z0 = toS(z.outline[0]);
                c.moveTo(z0.x, z0.y);
                for (let i = 1; i < z.outline.length; i++) {
                    const zp = toS(z.outline[i]);
                    c.lineTo(zp.x, zp.y);
                }
                c.closePath();
                c.fill();
            }
        }
        else if (kind === 'mask') {
            c.fillStyle = 'rgba(30,100,40,0.45)';
            if (pts.length >= 3) {
                c.beginPath();
                const p0 = toS(pts[0]);
                c.moveTo(p0.x, p0.y);
                for (let i = 1; i < pts.length; i++) {
                    const p = toS(pts[i]);
                    c.lineTo(p.x, p.y);
                }
                c.closePath();
                c.fill();
            }
            c.fillStyle = '#0A0C10';
            const maskFront = isFrontSideTitle(title);
            for (const fp of doc.footprints) {
                const fpFront = fp.layer !== PcbLayerId.B_CU;
                for (const pad of fp.pads) {
                    const th = pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH;
                    if (!th && fpFront !== maskFront)
                        continue;
                    if (!th && pad.layers && pad.layers.length > 0) {
                        const want = maskFront ? PcbLayerId.F_CU : PcbLayerId.B_CU;
                        if (!padOnCopperLayer(pad, want))
                            continue;
                    }
                    const w = padWorldPosition(fp, pad);
                    const p = toS(w);
                    const r = Math.max(2, Math.max(pad.size.x, pad.size.y) * zoom / 2 + 2);
                    c.beginPath();
                    c.arc(p.x, p.y, r, 0, Math.PI * 2);
                    c.fill();
                }
            }
        }
        else if (kind === 'paste') {
            c.fillStyle = '#D0D0D8';
            const pasteFront = isFrontSideTitle(title);
            for (const fp of doc.footprints) {
                const fpFront = fp.layer !== PcbLayerId.B_CU;
                if (fpFront !== pasteFront)
                    continue;
                for (const pad of fp.pads) {
                    if (pad.type !== PcbPadType.SMD)
                        continue;
                    const want = pasteFront ? PcbLayerId.F_CU : PcbLayerId.B_CU;
                    if (!padOnCopperLayer(pad, want))
                        continue;
                    const w = padWorldPosition(fp, pad);
                    const p = toS(w);
                    const hw = Math.max(1, pad.size.x * zoom / 2);
                    const hh = Math.max(1, pad.size.y * zoom / 2);
                    c.fillRect(p.x - hw, p.y - hh, hw * 2, hh * 2);
                }
            }
        }
        else if (kind === 'silk') {
            c.strokeStyle = '#E8F4FF';
            c.lineWidth = 1;
            c.fillStyle = '#E8F4FF';
            c.font = '9px sans-serif';
            const silkFront = isFrontSideTitle(title);
            for (const fp of doc.footprints) {
                const fpFront = fp.layer !== PcbLayerId.B_CU;
                if (fpFront !== silkFront)
                    continue;
                const p = toS(fp.position);
                c.fillText(fp.refDes, p.x - 8, p.y - 6);
            }
        }
        else if (kind === 'drill') {
            c.strokeStyle = '#AAAAAA';
            c.fillStyle = '#111111';
            for (const via of doc.vias) {
                const p = toS(via.position);
                const r = Math.max(1.5, via.drill * zoom / 2);
                c.beginPath();
                c.arc(p.x, p.y, r, 0, Math.PI * 2);
                c.fill();
                c.stroke();
            }
            for (const fp of doc.footprints) {
                for (const pad of fp.pads) {
                    if (pad.type === PcbPadType.SMD)
                        continue;
                    const w = padWorldPosition(fp, pad);
                    const p = toS(w);
                    const drill = pad.drill !== undefined ? pad.drill : pad.size.x * 0.45;
                    const r = Math.max(1.2, drill * zoom / 2);
                    c.beginPath();
                    c.arc(p.x, p.y, r, 0, Math.PI * 2);
                    c.fill();
                    c.stroke();
                }
            }
        }
        else {
            // edge / other
            c.strokeStyle = '#E8A020';
            c.lineWidth = 2;
            if (pts.length >= 2) {
                c.beginPath();
                const p0 = toS(pts[0]);
                c.moveTo(p0.x, p0.y);
                for (let i = 1; i < pts.length; i++) {
                    const p = toS(pts[i]);
                    c.lineTo(p.x, p.y);
                }
                c.closePath();
                c.stroke();
            }
        }
        c.fillStyle = 'rgba(0,0,0,0.65)';
        c.fillRect(0, 0, this.viewW, 16);
        c.fillStyle = '#FFFFFF';
        c.font = 'bold 10px sans-serif';
        c.fillText(`${title} · ${fname}`, 6, 12);
    }
    private classifyLayer(title: string, fname: string): string {
        const t = (title + ' ' + fname).toLowerCase();
        if (t.indexOf('drill') >= 0)
            return 'drill';
        if (t.indexOf('mask') >= 0 || t.indexOf('soldermask') >= 0)
            return 'mask';
        if (t.indexOf('paste') >= 0)
            return 'paste';
        if (t.indexOf('silk') >= 0)
            return 'silk';
        if (t.indexOf('edge') >= 0 || t.indexOf('outline') >= 0)
            return 'edge';
        if (t.indexOf('cu') >= 0 || t.indexOf('copper') >= 0 || t.indexOf('.gtl') >= 0 ||
            t.indexOf('.gbl') >= 0 || t.indexOf('.g1') >= 0)
            return 'copper';
        return 'edge';
    }
    private copperIdFromTitle(title: string, doc: PcbDocument): PcbLayerId {
        const t = title.toLowerCase();
        if (t.indexOf('back') >= 0 || t.indexOf('b.cu') >= 0 || t.indexOf('bottom') >= 0) {
            return PcbLayerId.B_CU;
        }
        const copper = copperLayersFromStack(doc.layerStack);
        for (let i = 0; i < copper.length; i++) {
            if (t.indexOf(copper[i].toLowerCase()) >= 0)
                return copper[i];
        }
        return PcbLayerId.F_CU;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Gerber 预览' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbGerberPreview.ets", line: 315, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Gerber 预览'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Gerber 预览'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.statusText);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 10, bottom: 4 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, bottom: 6 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '刷新',
                        widthVal: 56,
                        onAction: () => {
                            this.refreshFileList();
                            this.previewKey++;
                            this.scheduleDraw();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbGerberPreview.ets", line: 322, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '刷新',
                            widthVal: 56,
                            onAction: () => {
                                this.refreshFileList();
                                this.previewKey++;
                                this.scheduleDraw();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '刷新',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '导出',
                        widthVal: 56,
                        onAction: () => { this.onExport(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbGerberPreview.ets", line: 331, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '导出',
                            widthVal: 56,
                            onAction: () => { this.onExport(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '导出',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Canvas.create(this.ctx);
            Canvas.width('100%');
            Canvas.height(200);
            Canvas.backgroundColor('#0A0C10');
            Canvas.key(`gbr-prev-${this.previewKey}-${this.selectedIdx}`);
            Canvas.onReady(() => { this.scheduleDraw(); });
            Canvas.onAreaChange((_o: Area, a: Area) => {
                this.viewW = Number(a.width);
                this.viewH = Number(a.height);
                this.scheduleDraw();
            });
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            List.create();
            List.layoutWeight(1);
            List.scrollBar(BarState.Auto);
            List.width('100%');
        }, List);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = (_item, idx: number) => {
                const name = _item;
                {
                    const itemCreation = (elmtId, isInitialRender) => {
                        ViewStackProcessor.StartGetAccessRecordingFor(elmtId);
                        ListItem.create(deepRenderFunction, true);
                        if (!isInitialRender) {
                            ListItem.pop();
                        }
                        ViewStackProcessor.StopGetAccessRecording();
                    };
                    const itemCreation2 = (elmtId, isInitialRender) => {
                        ListItem.create(deepRenderFunction, true);
                    };
                    const deepRenderFunction = (elmtId, isInitialRender) => {
                        itemCreation(elmtId, isInitialRender);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Button.createWithChild({ type: ButtonType.Normal });
                            Button.width('100%');
                            Button.padding({ left: 8, right: 8, top: 4, bottom: 4 });
                            Button.backgroundColor(idx === this.selectedIdx
                                ? ProteusColors.TREE_SELECTED : Color.Transparent);
                            Button.border({ width: 0 });
                            Button.onClick(() => {
                                this.selectedIdx = idx;
                                this.previewKey++;
                                this.scheduleDraw();
                            });
                        }, Button);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Column.create();
                            Column.alignItems(HorizontalAlign.Start);
                            Column.width('100%');
                        }, Column);
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(this.layerTitles[idx] ?? name);
                            Text.fontSize(ProteusFonts.STATUS);
                            Text.fontColor(idx === this.selectedIdx
                                ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY);
                            Text.width('100%');
                            Text.textAlign(TextAlign.Start);
                        }, Text);
                        Text.pop();
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            Text.create(name);
                            Text.fontSize(9);
                            Text.fontColor(ProteusColors.TEXT_SECONDARY);
                            Text.width('100%');
                            Text.textAlign(TextAlign.Start);
                        }, Text);
                        Text.pop();
                        Column.pop();
                        Button.pop();
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(itemCreation2, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(elmtId, this.fileNames, forEachItemGenFunction, (name: string, idx: number) => `${idx}:${name}`, true, true);
        }, ForEach);
        ForEach.pop();
        List.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
