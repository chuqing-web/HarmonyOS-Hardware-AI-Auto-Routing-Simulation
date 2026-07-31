if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbLayerPanel_Params {
    themeRev?: number;
    layerRows?: PcbLayerRow[];
    activeLayer?: PcbLayerId;
    panelWidth?: number;
    onLayerSelect?: (id: PcbLayerId) => void;
    onVisibilityChange?: (id: PcbLayerId, visible: boolean) => void;
    onOpacityChange?: (id: PcbLayerId, opacity: number) => void;
    onPreset?: (preset: string) => void;
}
import { PcbLayerId } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusPanelTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusIcon, ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
export interface PcbLayerRow {
    id: PcbLayerId;
    name: string;
    visible: boolean;
    color: string;
    opacity: number;
}
export class PcbLayerPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__layerRows = new SynchedPropertyObjectOneWayPU(params.layerRows, this, "layerRows");
        this.__activeLayer = new SynchedPropertySimpleOneWayPU(params.activeLayer, this, "activeLayer");
        this.__panelWidth = new SynchedPropertySimpleOneWayPU(params.panelWidth, this, "panelWidth");
        this.onLayerSelect = (_id: PcbLayerId) => { };
        this.onVisibilityChange = (_id: PcbLayerId, _v: boolean) => { };
        this.onOpacityChange = (_id: PcbLayerId, _o: number) => { };
        this.onPreset = (_p: string) => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbLayerPanel_Params) {
        if (params.layerRows === undefined) {
            this.__layerRows.set([]);
        }
        if (params.activeLayer === undefined) {
            this.__activeLayer.set(PcbLayerId.F_CU);
        }
        if (params.panelWidth === undefined) {
            this.__panelWidth.set(200);
        }
        if (params.onLayerSelect !== undefined) {
            this.onLayerSelect = params.onLayerSelect;
        }
        if (params.onVisibilityChange !== undefined) {
            this.onVisibilityChange = params.onVisibilityChange;
        }
        if (params.onOpacityChange !== undefined) {
            this.onOpacityChange = params.onOpacityChange;
        }
        if (params.onPreset !== undefined) {
            this.onPreset = params.onPreset;
        }
    }
    updateStateVars(params: PcbLayerPanel_Params) {
        this.__layerRows.reset(params.layerRows);
        this.__activeLayer.reset(params.activeLayer);
        this.__panelWidth.reset(params.panelWidth);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__layerRows.purgeDependencyOnElmtId(rmElmtId);
        this.__activeLayer.purgeDependencyOnElmtId(rmElmtId);
        this.__panelWidth.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__layerRows.aboutToBeDeleted();
        this.__activeLayer.aboutToBeDeleted();
        this.__panelWidth.aboutToBeDeleted();
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
    private __layerRows: SynchedPropertySimpleOneWayPU<PcbLayerRow[]>;
    get layerRows() {
        return this.__layerRows.get();
    }
    set layerRows(newValue: PcbLayerRow[]) {
        this.__layerRows.set(newValue);
    }
    private __activeLayer: SynchedPropertySimpleOneWayPU<PcbLayerId>;
    get activeLayer() {
        return this.__activeLayer.get();
    }
    set activeLayer(newValue: PcbLayerId) {
        this.__activeLayer.set(newValue);
    }
    private __panelWidth: SynchedPropertySimpleOneWayPU<number>;
    get panelWidth() {
        return this.__panelWidth.get();
    }
    set panelWidth(newValue: number) {
        this.__panelWidth.set(newValue);
    }
    private onLayerSelect: (id: PcbLayerId) => void;
    private onVisibilityChange: (id: PcbLayerId, visible: boolean) => void;
    private onOpacityChange: (id: PcbLayerId, opacity: number) => void;
    private onPreset: (preset: string) => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.panelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.BORDER });
            Column.hitTestBehavior(HitTestMode.Default);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Layers' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbLayerPanel.ets", line: 31, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Layers'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Layers'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 3 });
            Row.width('100%');
            Row.padding({ left: 6, right: 6, bottom: 4 });
        }, Row);
        this.presetChip.bind(this)('顶层', 'top');
        this.presetChip.bind(this)('底层', 'bottom');
        this.presetChip.bind(this)('单层', 'solo');
        this.presetChip.bind(this)('全部', 'all');
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            List.create();
            List.layoutWeight(1);
            List.scrollBar(BarState.Auto);
        }, List);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const row = _item;
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
                        this.layerRow.bind(this)(row);
                        ListItem.pop();
                    };
                    this.observeComponentCreation2(itemCreation2, ListItem);
                    ListItem.pop();
                }
            };
            this.forEachUpdateFunction(elmtId, this.layerRows, forEachItemGenFunction, (row: PcbLayerRow) => `${row.id}:${row.visible}:${row.opacity}`, false, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        Column.pop();
    }
    presetChip(label: string, preset: string, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.height(22);
            Button.padding({ left: 6, right: 6 });
            Button.backgroundColor(ProteusColors.BTN_BG);
            Button.border({ width: 1, color: ProteusColors.BORDER });
            Button.borderRadius(2);
            Button.stateEffect(false);
            Button.onClick(() => { this.onPreset(preset); });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(label);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
        }, Text);
        Text.pop();
        Button.pop();
    }
    opacityChip(label: string, id: PcbLayerId, opacity: number, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.height(18);
            Button.padding({ left: 4, right: 4 });
            Button.backgroundColor(Color.Transparent);
            Button.border({ width: 1, color: ProteusColors.BORDER });
            Button.borderRadius(2);
            Button.stateEffect(false);
            Button.onClick(() => { this.onOpacityChange(id, opacity); });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(label);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        Button.pop();
    }
    layerRow(row: PcbLayerRow, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ right: 4 });
            Column.backgroundColor(row.id === this.activeLayer ? ProteusColors.TREE_SELECTED : Color.Transparent);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.TREE_ROW_HEIGHT + 4);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(4);
            Column.height(22);
            Column.backgroundColor(row.color);
            Column.margin({ left: 4, right: 6 });
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.layoutWeight(1);
            Button.height(ProteusDimens.TREE_ROW_HEIGHT + 4);
            Button.padding({ left: 2, right: 2 });
            Button.backgroundColor(Color.Transparent);
            Button.border({ width: 0 });
            Button.stateEffect(false);
            Button.onClick(() => { this.onLayerSelect(row.id); });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(row.name);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(row.id === this.activeLayer
                ? ProteusColors.SELECTED
                : (row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY));
            Text.fontWeight(row.id === this.activeLayer ? FontWeight.Bold : FontWeight.Normal);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.width('100%');
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        Button.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.width(28);
            Button.height(26);
            Button.padding(0);
            Button.backgroundColor(Color.Transparent);
            Button.border({ width: 0 });
            Button.stateEffect(false);
            Button.onClick(() => { this.onVisibilityChange(row.id, !row.visible); });
        }, Button);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusIcon(this, {
                        name: row.visible ? ProteusIconName.GRID : ProteusIconName.CLOSE,
                        iconSize: 12,
                        color: row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbLayerPanel.ets", line: 122, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            name: row.visible ? ProteusIconName.GRID : ProteusIconName.CLOSE,
                            iconSize: 12,
                            color: row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        name: row.visible ? ProteusIconName.GRID : ProteusIconName.CLOSE,
                        iconSize: 12,
                        color: row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY
                    });
                }
            }, { name: "ProteusIcon" });
        }
        Button.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // 透明度快捷调节：铜层 + 丝印
            if (row.id === PcbLayerId.F_CU || row.id === PcbLayerId.B_CU ||
                row.id === PcbLayerId.IN1_CU || row.id === PcbLayerId.IN2_CU ||
                row.id === PcbLayerId.F_SILKS || row.id === PcbLayerId.B_SILKS) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 2 });
                        Row.width('100%');
                        Row.padding({ left: 14, right: 6, bottom: 2 });
                    }, Row);
                    this.opacityChip.bind(this)('30%', row.id, 0.3);
                    this.opacityChip.bind(this)('60%', row.id, 0.6);
                    this.opacityChip.bind(this)('100%', row.id, 1.0);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${Math.round(row.opacity * 100)}%`);
                        Text.fontSize(9);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ left: 4 });
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
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
