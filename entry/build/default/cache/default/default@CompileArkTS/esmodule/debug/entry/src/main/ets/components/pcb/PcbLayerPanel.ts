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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.panelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.BORDER });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Layers' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbLayerPanel.ets", line: 28, col: 7 });
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
            this.forEachUpdateFunction(elmtId, this.layerRows, forEachItemGenFunction, (row: PcbLayerRow) => row.id, false, false);
        }, ForEach);
        ForEach.pop();
        List.pop();
        Column.pop();
    }
    layerRow(row: PcbLayerRow, parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.TREE_ROW_HEIGHT + 6);
            Row.padding({ right: 6 });
            Row.backgroundColor(row.id === this.activeLayer ? ProteusColors.TREE_SELECTED : Color.Transparent);
            Row.onClick(() => {
                this.onLayerSelect(row.id);
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // KiCad 风格左侧色条
            Column.create();
            // KiCad 风格左侧色条
            Column.width(4);
            // KiCad 风格左侧色条
            Column.height(22);
            // KiCad 风格左侧色条
            Column.backgroundColor(row.color);
            // KiCad 风格左侧色条
            Column.margin({ left: 4, right: 6 });
        }, Column);
        // KiCad 风格左侧色条
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(row.name);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(row.id === this.activeLayer
                ? ProteusColors.SELECTED
                : (row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY));
            Text.fontWeight(row.id === this.activeLayer ? FontWeight.Bold : FontWeight.Normal);
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 可见性切换
            Column.create();
            // 可见性切换
            Column.width(24);
            // 可见性切换
            Column.height(22);
            // 可见性切换
            Column.justifyContent(FlexAlign.Center);
            // 可见性切换
            Column.onClick(() => {
                this.onVisibilityChange(row.id, !row.visible);
            });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusIcon(this, {
                        name: row.visible ? ProteusIconName.GRID : ProteusIconName.CLOSE,
                        iconSize: 12,
                        color: row.visible ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbLayerPanel.ets", line: 67, col: 9 });
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
        // 可见性切换
        Column.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
