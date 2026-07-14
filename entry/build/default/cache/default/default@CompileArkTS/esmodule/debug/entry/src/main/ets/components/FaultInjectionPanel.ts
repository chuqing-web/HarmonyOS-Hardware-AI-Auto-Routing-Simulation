if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface FaultInjectionPanel_Params {
    statusMessage?: string;
    selectedComponentId?: string;
    faultType?: string;
    scanResults?: FaultScanResult[];
    targetRefDes?: string;
    appService?: AppService;
    faultOptions?: FaultTypeOption[];
    faultLabels?: string[];
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { FaultType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { FaultScanResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusChipGrid, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
interface FaultTypeOption {
    type: string;
    label: string;
}
export class FaultInjectionPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(params.selectedComponentId, this, "selectedComponentId");
        this.__faultType = new ObservedPropertySimplePU(FaultType.RESISTOR_OPEN, this, "faultType");
        this.__scanResults = new ObservedPropertyObjectPU([], this, "scanResults");
        this.__targetRefDes = new ObservedPropertySimplePU('', this, "targetRefDes");
        this.appService = AppService.getInstance();
        this.faultOptions = [
            { type: FaultType.RESISTOR_OPEN, label: '电阻开路' },
            { type: FaultType.RESISTOR_SHORT, label: '电阻短路' },
            { type: FaultType.CAP_LEAK, label: '电容漏电' },
            { type: FaultType.INDUCTOR_OPEN, label: '电感开路' },
            { type: FaultType.TRANSISTOR_BREAKDOWN, label: '晶体击穿' },
            { type: FaultType.MOS_DAMAGE, label: 'MOS损坏' },
            { type: FaultType.MCU_IO_SHORT, label: 'IO短路' },
            { type: FaultType.CRYSTAL_STOP, label: '晶振停振' },
            { type: FaultType.RESET_STUCK, label: '复位卡死' }
        ];
        this.faultLabels = [
            '电阻开路', '电阻短路', '电容漏电', '电感开路', '晶体击穿',
            'MOS损坏', 'IO短路', '晶振停振', '复位卡死'
        ];
        this.setInitiallyProvidedValue(params);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: FaultInjectionPanel_Params) {
        if (params.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (params.faultType !== undefined) {
            this.faultType = params.faultType;
        }
        if (params.scanResults !== undefined) {
            this.scanResults = params.scanResults;
        }
        if (params.targetRefDes !== undefined) {
            this.targetRefDes = params.targetRefDes;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.faultOptions !== undefined) {
            this.faultOptions = params.faultOptions;
        }
        if (params.faultLabels !== undefined) {
            this.faultLabels = params.faultLabels;
        }
    }
    updateStateVars(params: FaultInjectionPanel_Params) {
        this.__selectedComponentId.reset(params.selectedComponentId);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__faultType.purgeDependencyOnElmtId(rmElmtId);
        this.__scanResults.purgeDependencyOnElmtId(rmElmtId);
        this.__targetRefDes.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__faultType.aboutToBeDeleted();
        this.__scanResults.aboutToBeDeleted();
        this.__targetRefDes.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(newValue: string) {
        this.__selectedComponentId.set(newValue);
    }
    private __faultType: ObservedPropertySimplePU<string>;
    get faultType() {
        return this.__faultType.get();
    }
    set faultType(newValue: string) {
        this.__faultType.set(newValue);
    }
    private __scanResults: ObservedPropertyObjectPU<FaultScanResult[]>;
    get scanResults() {
        return this.__scanResults.get();
    }
    set scanResults(newValue: FaultScanResult[]) {
        this.__scanResults.set(newValue);
    }
    private __targetRefDes: ObservedPropertySimplePU<string>;
    get targetRefDes() {
        return this.__targetRefDes.get();
    }
    set targetRefDes(newValue: string) {
        this.__targetRefDes.set(newValue);
    }
    private appService: AppService;
    private faultOptions: FaultTypeOption[];
    private faultLabels: string[];
    aboutToAppear(): void {
        this.updateTargetLabel();
    }
    onSelectionChange(): void {
        this.updateTargetLabel();
    }
    private updateTargetLabel(): void {
        if (this.selectedComponentId.length === 0) {
            this.targetRefDes = '';
            return;
        }
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === this.selectedComponentId);
        this.targetRefDes = comp !== undefined ? comp.refDes : this.selectedComponentId;
    }
    private faultTypeIndex(): number {
        for (let i = 0; i < this.faultOptions.length; i++) {
            if (this.faultOptions[i].type === this.faultType) {
                return i;
            }
        }
        return 0;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ bottom: 8 });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: '故障注入仿真' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 70, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '故障注入仿真'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '故障注入仿真'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.targetRefDes.length > 0 ? `目标: ${this.targetRefDes}` : '目标: 请选中画布器件');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.targetRefDes.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('故障类型');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.padding({ left: 8, right: 8 });
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusChipGrid(this, {
                        labels: this.faultLabels,
                        selectedIdx: this.faultTypeIndex(),
                        colsPerRow: 3,
                        onSelect: (idx: number) => {
                            if (idx >= 0 && idx < this.faultOptions.length) {
                                this.faultType = this.faultOptions[idx].type;
                            }
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 87, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            labels: this.faultLabels,
                            selectedIdx: this.faultTypeIndex(),
                            colsPerRow: 3,
                            onSelect: (idx: number) => {
                                if (idx >= 0 && idx < this.faultOptions.length) {
                                    this.faultType = this.faultOptions[idx].type;
                                }
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        labels: this.faultLabels,
                        selectedIdx: this.faultTypeIndex(),
                        colsPerRow: 3
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '注入故障',
                        widthVal: '48%',
                        onAction: () => {
                            if (!this.selectedComponentId) {
                                this.statusMessage = '请先选中器件';
                                return;
                            }
                            const r = this.appService.injectFault(this.selectedComponentId, this.faultType as FaultType);
                            this.statusMessage = r.success ? `已注入 ${this.faultType}` : `注入失败: ${r.error}`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 101, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '注入故障',
                            widthVal: '48%',
                            onAction: () => {
                                if (!this.selectedComponentId) {
                                    this.statusMessage = '请先选中器件';
                                    return;
                                }
                                const r = this.appService.injectFault(this.selectedComponentId, this.faultType as FaultType);
                                this.statusMessage = r.success ? `已注入 ${this.faultType}` : `注入失败: ${r.error}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '注入故障',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '批量扫描',
                        widthVal: '48%',
                        onAction: () => {
                            this.scanResults = this.appService.batchFaultScan();
                            this.statusMessage = `扫描完成: ${this.scanResults.length} 种故障`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 113, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '批量扫描',
                            widthVal: '48%',
                            onAction: () => {
                                this.scanResults = this.appService.batchFaultScan();
                                this.statusMessage = `扫描完成: ${this.scanResults.length} 种故障`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '批量扫描',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '清除全部故障',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.clearFaults();
                            this.scanResults = [];
                            this.statusMessage = '故障注入已清除';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 125, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '清除全部故障',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.clearFaults();
                                this.scanResults = [];
                                this.statusMessage = '故障注入已清除';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '清除全部故障',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.scanResults.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                        Divider.margin({ top: 4 });
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('AI 故障定位汇总');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.fontWeight(FontWeight.Medium);
                        Text.padding({ left: 8, top: 4 });
                        Text.alignSelf(ItemAlign.Start);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        List.create({ space: 4 });
                        List.width('100%');
                        List.padding({ left: 8, right: 8, bottom: 8 });
                    }, List);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const item = _item;
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
                                        Column.create({ space: 2 });
                                        Column.alignItems(HorizontalAlign.Start);
                                        Column.width('100%');
                                        Column.padding(6);
                                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                                    }, Column);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(`${item.faultType}`);
                                        Text.fontSize(ProteusFonts.PARAM_KEY);
                                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                        Text.maxLines(1);
                                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(item.waveSignature);
                                        Text.fontSize(ProteusFonts.STATUS);
                                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                        Text.maxLines(1);
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        If.create();
                                        if (item.aiDiagnosis.length > 0) {
                                            this.ifElseBranchUpdateFunction(0, () => {
                                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                                    Text.create(item.aiDiagnosis);
                                                    Text.fontSize(ProteusFonts.STATUS);
                                                    Text.fontColor(ProteusColors.HOVER_PREVIEW);
                                                    Text.maxLines(2);
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
                                    ListItem.pop();
                                };
                                this.observeComponentCreation2(itemCreation2, ListItem);
                                ListItem.pop();
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.scanResults.slice(0, 15), forEachItemGenFunction, (item: FaultScanResult) => `${item.faultType}_${item.targetUuid}`, false, false);
                    }, ForEach);
                    ForEach.pop();
                    List.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Column.pop();
        Scroll.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
