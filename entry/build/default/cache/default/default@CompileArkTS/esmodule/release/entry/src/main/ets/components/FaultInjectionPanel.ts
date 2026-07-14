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
    constructor(j74, k74, l74, m74 = -1, n74 = undefined, o74) {
        super(j74, l74, m74, o74);
        if (typeof n74 === "function") {
            this.paramsGenerator_ = n74;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(k74.statusMessage, this, "statusMessage");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(k74.selectedComponentId, this, "selectedComponentId");
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
        this.setInitiallyProvidedValue(k74);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(i74: FaultInjectionPanel_Params) {
        if (i74.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (i74.faultType !== undefined) {
            this.faultType = i74.faultType;
        }
        if (i74.scanResults !== undefined) {
            this.scanResults = i74.scanResults;
        }
        if (i74.targetRefDes !== undefined) {
            this.targetRefDes = i74.targetRefDes;
        }
        if (i74.appService !== undefined) {
            this.appService = i74.appService;
        }
        if (i74.faultOptions !== undefined) {
            this.faultOptions = i74.faultOptions;
        }
        if (i74.faultLabels !== undefined) {
            this.faultLabels = i74.faultLabels;
        }
    }
    updateStateVars(h74: FaultInjectionPanel_Params) {
        this.__selectedComponentId.reset(h74.selectedComponentId);
    }
    purgeVariableDependenciesOnElmtId(g74) {
        this.__statusMessage.purgeDependencyOnElmtId(g74);
        this.__selectedComponentId.purgeDependencyOnElmtId(g74);
        this.__faultType.purgeDependencyOnElmtId(g74);
        this.__scanResults.purgeDependencyOnElmtId(g74);
        this.__targetRefDes.purgeDependencyOnElmtId(g74);
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
    set statusMessage(f74: string) {
        this.__statusMessage.set(f74);
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(e74: string) {
        this.__selectedComponentId.set(e74);
    }
    private __faultType: ObservedPropertySimplePU<string>;
    get faultType() {
        return this.__faultType.get();
    }
    set faultType(d74: string) {
        this.__faultType.set(d74);
    }
    private __scanResults: ObservedPropertyObjectPU<FaultScanResult[]>;
    get scanResults() {
        return this.__scanResults.get();
    }
    set scanResults(c74: FaultScanResult[]) {
        this.__scanResults.set(c74);
    }
    private __targetRefDes: ObservedPropertySimplePU<string>;
    get targetRefDes() {
        return this.__targetRefDes.get();
    }
    set targetRefDes(b74: string) {
        this.__targetRefDes.set(b74);
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
        const y73 = this.appService.schematicEditor.getDocument();
        const z73 = y73.components.find(a74 => a74.id === this.selectedComponentId);
        this.targetRefDes = z73 !== undefined ? z73.refDes : this.selectedComponentId;
    }
    private faultTypeIndex(): number {
        for (let x73 = 0; x73 < this.faultOptions.length; x73++) {
            if (this.faultOptions[x73].type === this.faultType) {
                return x73;
            }
        }
        return 0;
    }
    initialRender() {
        this.observeComponentCreation2((v73, w73) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
        }, Scroll);
        this.observeComponentCreation2((t73, u73) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ bottom: 8 });
        }, Column);
        {
            this.observeComponentCreation2((p73, q73) => {
                if (q73) {
                    let r73 = new ProteusSectionTitle(this, { title: '故障注入仿真' }, undefined, p73, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 70, col: 9 });
                    ViewPU.create(r73);
                    let s73 = () => {
                        return {
                            title: '故障注入仿真'
                        };
                    };
                    r73.paramsGenerator_ = s73;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(p73, {
                        title: '故障注入仿真'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((n73, o73) => {
            Text.create(this.targetRefDes.length > 0 ? `目标: ${this.targetRefDes}` : '目标: 请选中画布器件');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.targetRefDes.length > 0 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((l73, m73) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((j73, k73) => {
            Text.create('故障类型');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((h73, i73) => {
            __Common__.create();
            __Common__.padding({ left: 8, right: 8 });
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((b73, c73) => {
                if (c73) {
                    let d73 = new ProteusChipGrid(this, {
                        labels: this.faultLabels,
                        selectedIdx: this.faultTypeIndex(),
                        colsPerRow: 3,
                        onSelect: (g73: number) => {
                            if (g73 >= 0 && g73 < this.faultOptions.length) {
                                this.faultType = this.faultOptions[g73].type;
                            }
                        }
                    }, undefined, b73, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 87, col: 9 });
                    ViewPU.create(d73);
                    let e73 = () => {
                        return {
                            labels: this.faultLabels,
                            selectedIdx: this.faultTypeIndex(),
                            colsPerRow: 3,
                            onSelect: (f73: number) => {
                                if (f73 >= 0 && f73 < this.faultOptions.length) {
                                    this.faultType = this.faultOptions[f73].type;
                                }
                            }
                        };
                    };
                    d73.paramsGenerator_ = e73;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b73, {
                        labels: this.faultLabels,
                        selectedIdx: this.faultTypeIndex(),
                        colsPerRow: 3
                    });
                }
            }, { name: "ProteusChipGrid" });
        }
        __Common__.pop();
        this.observeComponentCreation2((z72, a73) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((t72, u72) => {
                if (u72) {
                    let v72 = new ProteusClassicBtn(this, {
                        label: '注入故障',
                        widthVal: '48%',
                        onAction: () => {
                            if (!this.selectedComponentId) {
                                this.statusMessage = '请先选中器件';
                                return;
                            }
                            const y72 = this.appService.injectFault(this.selectedComponentId, this.faultType as FaultType);
                            this.statusMessage = y72.success ? `已注入 ${this.faultType}` : `注入失败: ${y72.error}`;
                        }
                    }, undefined, t72, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 101, col: 11 });
                    ViewPU.create(v72);
                    let w72 = () => {
                        return {
                            label: '注入故障',
                            widthVal: '48%',
                            onAction: () => {
                                if (!this.selectedComponentId) {
                                    this.statusMessage = '请先选中器件';
                                    return;
                                }
                                const x72 = this.appService.injectFault(this.selectedComponentId, this.faultType as FaultType);
                                this.statusMessage = x72.success ? `已注入 ${this.faultType}` : `注入失败: ${x72.error}`;
                            }
                        };
                    };
                    v72.paramsGenerator_ = w72;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(t72, {
                        label: '注入故障',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((p72, q72) => {
                if (q72) {
                    let r72 = new ProteusClassicBtn(this, {
                        label: '批量扫描',
                        widthVal: '48%',
                        onAction: () => {
                            this.scanResults = this.appService.batchFaultScan();
                            this.statusMessage = `扫描完成: ${this.scanResults.length} 种故障`;
                        }
                    }, undefined, p72, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 113, col: 11 });
                    ViewPU.create(r72);
                    let s72 = () => {
                        return {
                            label: '批量扫描',
                            widthVal: '48%',
                            onAction: () => {
                                this.scanResults = this.appService.batchFaultScan();
                                this.statusMessage = `扫描完成: ${this.scanResults.length} 种故障`;
                            }
                        };
                    };
                    r72.paramsGenerator_ = s72;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(p72, {
                        label: '批量扫描',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((n72, o72) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((j72, k72) => {
                if (k72) {
                    let l72 = new ProteusClassicBtn(this, {
                        label: '清除全部故障',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.clearFaults();
                            this.scanResults = [];
                            this.statusMessage = '故障注入已清除';
                        }
                    }, undefined, j72, () => { }, { page: "entry/src/main/ets/components/FaultInjectionPanel.ets", line: 125, col: 9 });
                    ViewPU.create(l72);
                    let m72 = () => {
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
                    l72.paramsGenerator_ = m72;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j72, {
                        label: '清除全部故障',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        this.observeComponentCreation2((c71, d71) => {
            If.create();
            if (this.scanResults.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((h72, i72) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                        Divider.margin({ top: 4 });
                    }, Divider);
                    this.observeComponentCreation2((f72, g72) => {
                        Text.create('AI 故障定位汇总');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.fontWeight(FontWeight.Medium);
                        Text.padding({ left: 8, top: 4 });
                        Text.alignSelf(ItemAlign.Start);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((d72, e72) => {
                        List.create({ space: 4 });
                        List.width('100%');
                        List.padding({ left: 8, right: 8, bottom: 8 });
                    }, List);
                    this.observeComponentCreation2((e71, f71) => {
                        ForEach.create();
                        const g71 = i71 => {
                            const j71 = i71;
                            {
                                const k71 = (b72, c72) => {
                                    ViewStackProcessor.StartGetAccessRecordingFor(b72);
                                    ListItem.create(m71, true);
                                    if (!c72) {
                                        ListItem.pop();
                                    }
                                    ViewStackProcessor.StopGetAccessRecording();
                                };
                                const l71 = (z71, a72) => {
                                    ListItem.create(m71, true);
                                };
                                const m71 = (n71, o71) => {
                                    k71(n71, o71);
                                    this.observeComponentCreation2((x71, y71) => {
                                        Column.create({ space: 2 });
                                        Column.alignItems(HorizontalAlign.Start);
                                        Column.width('100%');
                                        Column.padding(6);
                                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                                    }, Column);
                                    this.observeComponentCreation2((v71, w71) => {
                                        Text.create(`${j71.faultType}`);
                                        Text.fontSize(ProteusFonts.PARAM_KEY);
                                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                        Text.maxLines(1);
                                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((t71, u71) => {
                                        Text.create(j71.waveSignature);
                                        Text.fontSize(ProteusFonts.STATUS);
                                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                        Text.maxLines(1);
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((p71, q71) => {
                                        If.create();
                                        if (j71.aiDiagnosis.length > 0) {
                                            this.ifElseBranchUpdateFunction(0, () => {
                                                this.observeComponentCreation2((r71, s71) => {
                                                    Text.create(j71.aiDiagnosis);
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
                                this.observeComponentCreation2(l71, ListItem);
                                ListItem.pop();
                            }
                        };
                        this.forEachUpdateFunction(e71, this.scanResults.slice(0, 15), g71, (h71: FaultScanResult) => `${h71.faultType}_${h71.targetUuid}`, false, false);
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
