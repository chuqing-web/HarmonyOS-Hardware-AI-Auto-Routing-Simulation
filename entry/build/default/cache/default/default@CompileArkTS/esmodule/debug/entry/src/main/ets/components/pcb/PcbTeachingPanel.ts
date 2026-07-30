if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbTeachingPanel_Params {
    statusMessage?: string;
    onRunDrc?: () => void;
    onInserted?: () => void;
    templates?: PcbLabTemplate[];
    activeCategory?: string;
    selectedId?: string;
    knowledgePoints?: string[];
    loading?: boolean;
    appService?: AppService;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { PcbLabTemplate } from 'ai_engine';
import { ProteusClassicBtn, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
const CATEGORY_LABELS: Map<string, string> = new Map([
    ['all', '全部'],
    ['power', '电源'],
    ['analog', '模拟'],
    ['passive', '无源'],
    ['discrete', '分立'],
    ['digital', '数字'],
    ['memory', '存储'],
    ['mcu', 'MCU'],
    ['peripheral', '外设'],
    ['sensor', '传感器'],
    ['instrument', '仪器']
]);
export class PcbTeachingPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.onRunDrc = () => { };
        this.onInserted = () => { };
        this.__templates = new ObservedPropertyObjectPU([], this, "templates");
        this.__activeCategory = new ObservedPropertySimplePU('all', this, "activeCategory");
        this.__selectedId = new ObservedPropertySimplePU('', this, "selectedId");
        this.__knowledgePoints = new ObservedPropertyObjectPU([], this, "knowledgePoints");
        this.__loading = new ObservedPropertySimplePU(false, this, "loading");
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbTeachingPanel_Params) {
        if (params.onRunDrc !== undefined) {
            this.onRunDrc = params.onRunDrc;
        }
        if (params.onInserted !== undefined) {
            this.onInserted = params.onInserted;
        }
        if (params.templates !== undefined) {
            this.templates = params.templates;
        }
        if (params.activeCategory !== undefined) {
            this.activeCategory = params.activeCategory;
        }
        if (params.selectedId !== undefined) {
            this.selectedId = params.selectedId;
        }
        if (params.knowledgePoints !== undefined) {
            this.knowledgePoints = params.knowledgePoints;
        }
        if (params.loading !== undefined) {
            this.loading = params.loading;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
    }
    updateStateVars(params: PcbTeachingPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__templates.purgeDependencyOnElmtId(rmElmtId);
        this.__activeCategory.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedId.purgeDependencyOnElmtId(rmElmtId);
        this.__knowledgePoints.purgeDependencyOnElmtId(rmElmtId);
        this.__loading.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__templates.aboutToBeDeleted();
        this.__activeCategory.aboutToBeDeleted();
        this.__selectedId.aboutToBeDeleted();
        this.__knowledgePoints.aboutToBeDeleted();
        this.__loading.aboutToBeDeleted();
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
    private onRunDrc: () => void;
    private onInserted: () => void;
    private __templates: ObservedPropertyObjectPU<PcbLabTemplate[]>;
    get templates() {
        return this.__templates.get();
    }
    set templates(newValue: PcbLabTemplate[]) {
        this.__templates.set(newValue);
    }
    private __activeCategory: ObservedPropertySimplePU<string>;
    get activeCategory() {
        return this.__activeCategory.get();
    }
    set activeCategory(newValue: string) {
        this.__activeCategory.set(newValue);
    }
    private __selectedId: ObservedPropertySimplePU<string>;
    get selectedId() {
        return this.__selectedId.get();
    }
    set selectedId(newValue: string) {
        this.__selectedId.set(newValue);
    }
    private __knowledgePoints: ObservedPropertyObjectPU<string[]>;
    get knowledgePoints() {
        return this.__knowledgePoints.get();
    }
    set knowledgePoints(newValue: string[]) {
        this.__knowledgePoints.set(newValue);
    }
    private __loading: ObservedPropertySimplePU<boolean>;
    get loading() {
        return this.__loading.get();
    }
    set loading(newValue: boolean) {
        this.__loading.set(newValue);
    }
    private appService: AppService;
    aboutToAppear(): void {
        void this.appService.ensureTemplatesReady().then(() => {
            this.refreshTemplates();
        });
    }
    private refreshTemplates(): void {
        this.templates = this.appService.listAvailablePcbLabTemplates(this.activeCategory);
    }
    private selectTemplate(tpl: PcbLabTemplate): void {
        this.selectedId = tpl.id;
        this.knowledgePoints = tpl.knowledgePoints.slice();
    }
    private async insertSelected(): Promise<void> {
        if (this.selectedId.length === 0) {
            this.statusMessage = '请先选择一个 PCB 实验模板';
            return;
        }
        if (this.loading) {
            return;
        }
        this.loading = true;
        try {
            const ok = await this.appService.loadPcbLabTemplate(this.selectedId);
            if (ok) {
                this.onInserted();
            }
        }
        finally {
            this.loading = false;
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
            Column.height('100%');
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: 'PCB 教学' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbTeachingPanel.ets", line: 73, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'PCB 教学'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'PCB 教学'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('实验 PCB 模板（与原理图一一对应）');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.scrollable(ScrollDirection.Horizontal);
            Scroll.scrollBar(BarState.Off);
            Scroll.width('100%');
            Scroll.padding({ left: 8, right: 8 });
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const cat = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(CATEGORY_LABELS.get(cat) ?? cat);
                    Text.fontSize(10);
                    Text.fontColor(this.activeCategory === cat ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_LABEL);
                    Text.padding({ left: 8, right: 8, top: 4, bottom: 4 });
                    Text.backgroundColor(this.activeCategory === cat ? ProteusColors.INPUT_READONLY_BG : 'transparent');
                    Text.border({
                        width: 1,
                        color: this.activeCategory === cat ? ProteusColors.SELECTED : ProteusColors.DIVIDER
                    });
                    Text.borderRadius(4);
                    Text.onClick(() => {
                        this.activeCategory = cat;
                        this.refreshTemplates();
                    });
                }, Text);
                Text.pop();
            };
            this.forEachUpdateFunction(elmtId, Array.from(CATEGORY_LABELS.keys()), forEachItemGenFunction, (cat: string) => cat, false, false);
        }, ForEach);
        ForEach.pop();
        Row.pop();
        Scroll.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.templates.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('暂无可用 PCB 模板（请确认 Test_Template 含 .pcbsim）');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.padding(12);
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        List.create({ space: 4 });
                        List.width('100%');
                        List.layoutWeight(1);
                        List.padding({ left: 8, right: 8 });
                    }, List);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const tpl = _item;
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
                                        Column.width('100%');
                                        Column.alignItems(HorizontalAlign.Start);
                                        Column.padding(8);
                                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                                        Column.border({
                                            width: 1,
                                            color: this.selectedId === tpl.id ? ProteusColors.SELECTED : ProteusColors.DIVIDER
                                        });
                                        Column.borderRadius(4);
                                        Column.onClick(() => { this.selectTemplate(tpl); });
                                    }, Column);
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(tpl.name);
                                        Text.fontSize(ProteusFonts.PARAM_KEY);
                                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                        Text.fontWeight(FontWeight.Medium);
                                    }, Text);
                                    Text.pop();
                                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                                        Text.create(tpl.description);
                                        Text.fontSize(10);
                                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                                        Text.maxLines(2);
                                    }, Text);
                                    Text.pop();
                                    Column.pop();
                                    ListItem.pop();
                                };
                                this.observeComponentCreation2(itemCreation2, ListItem);
                                ListItem.pop();
                            }
                        };
                        this.forEachUpdateFunction(elmtId, this.templates, forEachItemGenFunction, (tpl: PcbLabTemplate) => tpl.id, false, false);
                    }, ForEach);
                    ForEach.pop();
                    List.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.loading ? '插入中…' : '插入模板',
                        widthVal: '48%',
                        onAction: () => { void this.insertSelected(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbTeachingPanel.ets", line: 145, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.loading ? '插入中…' : '插入模板',
                            widthVal: '48%',
                            onAction: () => { void this.insertSelected(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.loading ? '插入中…' : '插入模板',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '跑 DRC',
                        widthVal: '48%',
                        onAction: () => {
                            this.onRunDrc();
                            this.statusMessage = '已触发 DRC，结果见 DRC 页签';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbTeachingPanel.ets", line: 150, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '跑 DRC',
                            widthVal: '48%',
                            onAction: () => {
                                this.onRunDrc();
                                this.statusMessage = '已触发 DRC，结果见 DRC 页签';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '跑 DRC',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.knowledgePoints.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('知识点 / 布线要点');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.fontWeight(FontWeight.Medium);
                        Text.padding({ left: 8 });
                        Text.alignSelf(ItemAlign.Start);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Scroll.create();
                        Scroll.layoutWeight(1);
                        Scroll.width('100%');
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 4 });
                        Column.width('100%');
                        Column.alignItems(HorizontalAlign.Start);
                        Column.padding({ left: 8, right: 8, bottom: 8 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = (_item, idx: number) => {
                            const tip = _item;
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(`${idx + 1}. ${tip}`);
                                Text.fontSize(10);
                                Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                Text.width('100%');
                            }, Text);
                            Text.pop();
                        };
                        this.forEachUpdateFunction(elmtId, this.knowledgePoints, forEachItemGenFunction, (tip: string, idx: number) => `${idx}_${tip}`, true, true);
                    }, ForEach);
                    ForEach.pop();
                    Column.pop();
                    Scroll.pop();
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
