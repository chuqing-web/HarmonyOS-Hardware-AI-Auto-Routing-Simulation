if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbRightPanel_Params {
    themeRev?: number;
    panelWidth?: number;
    selectionInfo?: string;
    selectedZoneId?: string;
    activeLayer?: PcbLayerId;
    drcViolations?: PcbDrcViolation[];
    onZonePriority?: (delta: number) => void;
    onZoneThermal?: () => void;
    onZoneRefreshCutouts?: () => void;
    activeTab?: PcbRightTab;
}
import { PcbDrcSeverity, PcbLayerId } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDrcViolation } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusClassicBtn, ProteusChipTab, ProteusPanelTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
enum PcbRightTab {
    PROPERTIES = 0,
    DRC = 1,
    LAYER = 2
}
export class PcbRightPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__panelWidth = new SynchedPropertySimpleOneWayPU(params.panelWidth, this, "panelWidth");
        this.__selectionInfo = new SynchedPropertySimpleOneWayPU(params.selectionInfo, this, "selectionInfo");
        this.__selectedZoneId = new SynchedPropertySimpleOneWayPU(params.selectedZoneId, this, "selectedZoneId");
        this.__activeLayer = new SynchedPropertySimpleOneWayPU(params.activeLayer, this, "activeLayer");
        this.__drcViolations = new SynchedPropertyObjectOneWayPU(params.drcViolations, this, "drcViolations");
        this.onZonePriority = (_d: number) => { };
        this.onZoneThermal = () => { };
        this.onZoneRefreshCutouts = () => { };
        this.__activeTab = new ObservedPropertySimplePU(PcbRightTab.PROPERTIES, this, "activeTab");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbRightPanel_Params) {
        if (params.panelWidth === undefined) {
            this.__panelWidth.set(260);
        }
        if (params.selectionInfo === undefined) {
            this.__selectionInfo.set('');
        }
        if (params.selectedZoneId === undefined) {
            this.__selectedZoneId.set('');
        }
        if (params.activeLayer === undefined) {
            this.__activeLayer.set(PcbLayerId.F_CU);
        }
        if (params.drcViolations === undefined) {
            this.__drcViolations.set([]);
        }
        if (params.onZonePriority !== undefined) {
            this.onZonePriority = params.onZonePriority;
        }
        if (params.onZoneThermal !== undefined) {
            this.onZoneThermal = params.onZoneThermal;
        }
        if (params.onZoneRefreshCutouts !== undefined) {
            this.onZoneRefreshCutouts = params.onZoneRefreshCutouts;
        }
        if (params.activeTab !== undefined) {
            this.activeTab = params.activeTab;
        }
    }
    updateStateVars(params: PcbRightPanel_Params) {
        this.__panelWidth.reset(params.panelWidth);
        this.__selectionInfo.reset(params.selectionInfo);
        this.__selectedZoneId.reset(params.selectedZoneId);
        this.__activeLayer.reset(params.activeLayer);
        this.__drcViolations.reset(params.drcViolations);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__panelWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__selectionInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedZoneId.purgeDependencyOnElmtId(rmElmtId);
        this.__activeLayer.purgeDependencyOnElmtId(rmElmtId);
        this.__drcViolations.purgeDependencyOnElmtId(rmElmtId);
        this.__activeTab.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__panelWidth.aboutToBeDeleted();
        this.__selectionInfo.aboutToBeDeleted();
        this.__selectedZoneId.aboutToBeDeleted();
        this.__activeLayer.aboutToBeDeleted();
        this.__drcViolations.aboutToBeDeleted();
        this.__activeTab.aboutToBeDeleted();
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
    private __panelWidth: SynchedPropertySimpleOneWayPU<number>;
    get panelWidth() {
        return this.__panelWidth.get();
    }
    set panelWidth(newValue: number) {
        this.__panelWidth.set(newValue);
    }
    private __selectionInfo: SynchedPropertySimpleOneWayPU<string>;
    get selectionInfo() {
        return this.__selectionInfo.get();
    }
    set selectionInfo(newValue: string) {
        this.__selectionInfo.set(newValue);
    }
    private __selectedZoneId: SynchedPropertySimpleOneWayPU<string>;
    get selectedZoneId() {
        return this.__selectedZoneId.get();
    }
    set selectedZoneId(newValue: string) {
        this.__selectedZoneId.set(newValue);
    }
    private __activeLayer: SynchedPropertySimpleOneWayPU<PcbLayerId>;
    get activeLayer() {
        return this.__activeLayer.get();
    }
    set activeLayer(newValue: PcbLayerId) {
        this.__activeLayer.set(newValue);
    }
    private __drcViolations: SynchedPropertySimpleOneWayPU<PcbDrcViolation[]>;
    get drcViolations() {
        return this.__drcViolations.get();
    }
    set drcViolations(newValue: PcbDrcViolation[]) {
        this.__drcViolations.set(newValue);
    }
    private onZonePriority: (delta: number) => void;
    private onZoneThermal: () => void;
    private onZoneRefreshCutouts: () => void;
    private __activeTab: ObservedPropertySimplePU<PcbRightTab>;
    get activeTab() {
        return this.__activeTab.get();
    }
    set activeTab(newValue: PcbRightTab) {
        this.__activeTab.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.panelWidth);
            Column.height('100%');
            Column.backgroundColor(ProteusColors.SIDEBAR_BG);
            Column.border({ width: { left: 1 }, color: ProteusColors.BORDER });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 2 });
            Row.width('100%');
            Row.padding({ left: 4, right: 4, top: 4, bottom: 4 });
            Row.backgroundColor(ProteusColors.PANEL_TITLE_BG);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipTab(this, {
                        label: '属性',
                        selected: this.activeTab === PcbRightTab.PROPERTIES,
                        fillWidth: true,
                        onSelect: () => { this.activeTab = PcbRightTab.PROPERTIES; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 32, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '属性',
                            selected: this.activeTab === PcbRightTab.PROPERTIES,
                            fillWidth: true,
                            onSelect: () => { this.activeTab = PcbRightTab.PROPERTIES; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '属性',
                        selected: this.activeTab === PcbRightTab.PROPERTIES,
                        fillWidth: true
                    });
                }
            }, { name: "ProteusChipTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipTab(this, {
                        label: 'DRC',
                        selected: this.activeTab === PcbRightTab.DRC,
                        fillWidth: true,
                        onSelect: () => { this.activeTab = PcbRightTab.DRC; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 38, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'DRC',
                            selected: this.activeTab === PcbRightTab.DRC,
                            fillWidth: true,
                            onSelect: () => { this.activeTab = PcbRightTab.DRC; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'DRC',
                        selected: this.activeTab === PcbRightTab.DRC,
                        fillWidth: true
                    });
                }
            }, { name: "ProteusChipTab" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipTab(this, {
                        label: '层',
                        selected: this.activeTab === PcbRightTab.LAYER,
                        fillWidth: true,
                        onSelect: () => { this.activeTab = PcbRightTab.LAYER; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 44, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '层',
                            selected: this.activeTab === PcbRightTab.LAYER,
                            fillWidth: true,
                            onSelect: () => { this.activeTab = PcbRightTab.LAYER; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '层',
                        selected: this.activeTab === PcbRightTab.LAYER,
                        fillWidth: true
                    });
                }
            }, { name: "ProteusChipTab" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.activeTab === PcbRightTab.PROPERTIES) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.buildPropertiesTab.bind(this)();
                });
            }
            else if (this.activeTab === PcbRightTab.DRC) {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.buildDrcTab.bind(this)();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(2, () => {
                    this.buildLayerTab.bind(this)();
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    buildPropertiesTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Selection' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 72, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Selection'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Selection'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectionInfo.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.selectionInfo);
                        Text.fontSize(ProteusFonts.PARAM_VALUE);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.padding({ left: 10, right: 10, top: 8, bottom: 8 });
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.padding(12);
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('未选中对象');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('点击封装、走线或过孔查看属性');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ top: 4 });
                    }, Text);
                    Text.pop();
                    Column.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectedZoneId.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusPanelTitle(this, { title: '覆铜编辑' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 94, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        title: '覆铜编辑'
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    title: '覆铜编辑'
                                });
                            }
                        }, { name: "ProteusPanelTitle" });
                    }
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 4 });
                        Row.padding({ left: 8, right: 8, bottom: 4 });
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '优先级-',
                                    widthVal: 72,
                                    onAction: () => { this.onZonePriority(-1); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 96, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '优先级-',
                                        widthVal: 72,
                                        onAction: () => { this.onZonePriority(-1); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '优先级-',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '优先级+',
                                    widthVal: 72,
                                    onAction: () => { this.onZonePriority(1); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 101, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '优先级+',
                                        widthVal: 72,
                                        onAction: () => { this.onZonePriority(1); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '优先级+',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create({ space: 4 });
                        Row.padding({ left: 8, right: 8, bottom: 8 });
                    }, Row);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '热焊盘',
                                    widthVal: 72,
                                    onAction: () => { this.onZoneThermal(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 109, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '热焊盘',
                                        widthVal: 72,
                                        onAction: () => { this.onZoneThermal(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '热焊盘',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '刷新挖空',
                                    widthVal: 72,
                                    onAction: () => { this.onZoneRefreshCutouts(); }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 114, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '刷新挖空',
                                        widthVal: 72,
                                        onAction: () => { this.onZoneRefreshCutouts(); }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '刷新挖空',
                                    widthVal: 72
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('覆铜工具下再次点击可手动挖空');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.padding({ left: 10, right: 10, bottom: 8 });
                    }, Text);
                    Text.pop();
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
    buildDrcTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Design Rules Check' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 134, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Design Rules Check'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Design Rules Check'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.drcViolations.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                        Row.padding(12);
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('✓');
                        Text.fontSize(16);
                        Text.fontColor(ProteusColors.ERC_OK);
                        Text.margin({ right: 6 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('无 DRC 违规');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_OK);
                    }, Text);
                    Text.pop();
                    Row.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        List.create();
                        List.layoutWeight(1);
                        List.scrollBar(BarState.Auto);
                    }, List);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const v = _item;
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
                                        Row.create();
                                        Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
                                        Row.width('100%');
                                    }, Row);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(v.severity === PcbDrcSeverity.ERROR ? '✕' : '!');
                                        Text.fontSize(12);
                                        Text.fontColor(v.severity === PcbDrcSeverity.ERROR
                                            ? ProteusColors.ERC_ERR : ProteusColors.ERC_WARN);
                                        Text.width(16);
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(v.message);
                                        Text.fontSize(ProteusFonts.STATUS);
                                        Text.fontColor(v.severity === PcbDrcSeverity.ERROR
                                            ? ProteusColors.ERC_ERR : ProteusColors.TEXT_LABEL);
                                        Text.layoutWeight(1);
                                    }, Text);
                                    Text.pop();
                                    Row.pop();
                                    ListItem.pop();
                                };
                                this.observeComponentCreation2(itemCreation2, ListItem);
                                ListItem.pop();
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.drcViolations, forEachItemGenFunction, (v: PcbDrcViolation) => v.id, false, false);
                    }, ForEach);
                    ForEach.pop();
                    List.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
    }
    buildLayerTab(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, { title: 'Active Layer' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbRightPanel.ets", line: 178, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'Active Layer'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'Active Layer'
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.activeLayer);
            Text.fontSize(ProteusFonts.PARAM_VALUE);
            Text.fontColor(ProteusColors.SELECTED);
            Text.fontWeight(FontWeight.Bold);
            Text.padding({ left: 12, top: 8, bottom: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('在左侧 Layers 面板点击切换活动层。\n走线时自动切换到 Front Copper。');
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 12, right: 12 });
            Text.lineHeight(16);
        }, Text);
        Text.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
