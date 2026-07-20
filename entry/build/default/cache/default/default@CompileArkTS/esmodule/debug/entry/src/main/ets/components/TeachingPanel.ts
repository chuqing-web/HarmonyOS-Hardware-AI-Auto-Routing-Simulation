if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface TeachingPanel_Params {
    statusMessage?: string;
    selectedComponentId?: string;
    templates?: LabTemplate[];
    tip?: KnowledgeTip | null;
    stepIndex?: number;
    activeCategory?: string;
    coverage?: LabCoverageReport;
    showCoverage?: boolean;
    templateDir?: string;
    hexDir?: string;
    appService?: AppService;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { LabTemplate, KnowledgeTip, LabCoverageReport } from 'ai_engine';
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
export class TeachingPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(params.selectedComponentId, this, "selectedComponentId");
        this.__templates = new ObservedPropertyObjectPU([], this, "templates");
        this.__tip = new ObservedPropertyObjectPU(null, this, "tip");
        this.__stepIndex = new ObservedPropertySimplePU(0, this, "stepIndex");
        this.__activeCategory = new ObservedPropertySimplePU('all', this, "activeCategory");
        this.__coverage = new ObservedPropertyObjectPU({ covered: [], missing: [], total: 0, percent: 0 }, this, "coverage");
        this.__showCoverage = new ObservedPropertySimplePU(false, this, "showCoverage");
        this.__templateDir = new ObservedPropertySimplePU('', this, "templateDir");
        this.__hexDir = new ObservedPropertySimplePU('', this, "hexDir");
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: TeachingPanel_Params) {
        if (params.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (params.templates !== undefined) {
            this.templates = params.templates;
        }
        if (params.tip !== undefined) {
            this.tip = params.tip;
        }
        if (params.stepIndex !== undefined) {
            this.stepIndex = params.stepIndex;
        }
        if (params.activeCategory !== undefined) {
            this.activeCategory = params.activeCategory;
        }
        if (params.coverage !== undefined) {
            this.coverage = params.coverage;
        }
        if (params.showCoverage !== undefined) {
            this.showCoverage = params.showCoverage;
        }
        if (params.templateDir !== undefined) {
            this.templateDir = params.templateDir;
        }
        if (params.hexDir !== undefined) {
            this.hexDir = params.hexDir;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
    }
    updateStateVars(params: TeachingPanel_Params) {
        this.__selectedComponentId.reset(params.selectedComponentId);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__templates.purgeDependencyOnElmtId(rmElmtId);
        this.__tip.purgeDependencyOnElmtId(rmElmtId);
        this.__stepIndex.purgeDependencyOnElmtId(rmElmtId);
        this.__activeCategory.purgeDependencyOnElmtId(rmElmtId);
        this.__coverage.purgeDependencyOnElmtId(rmElmtId);
        this.__showCoverage.purgeDependencyOnElmtId(rmElmtId);
        this.__templateDir.purgeDependencyOnElmtId(rmElmtId);
        this.__hexDir.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__templates.aboutToBeDeleted();
        this.__tip.aboutToBeDeleted();
        this.__stepIndex.aboutToBeDeleted();
        this.__activeCategory.aboutToBeDeleted();
        this.__coverage.aboutToBeDeleted();
        this.__showCoverage.aboutToBeDeleted();
        this.__templateDir.aboutToBeDeleted();
        this.__hexDir.aboutToBeDeleted();
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
    private __templates: ObservedPropertyObjectPU<LabTemplate[]>;
    get templates() {
        return this.__templates.get();
    }
    set templates(newValue: LabTemplate[]) {
        this.__templates.set(newValue);
    }
    private __tip: ObservedPropertyObjectPU<KnowledgeTip | null>;
    get tip() {
        return this.__tip.get();
    }
    set tip(newValue: KnowledgeTip | null) {
        this.__tip.set(newValue);
    }
    private __stepIndex: ObservedPropertySimplePU<number>;
    get stepIndex() {
        return this.__stepIndex.get();
    }
    set stepIndex(newValue: number) {
        this.__stepIndex.set(newValue);
    }
    private __activeCategory: ObservedPropertySimplePU<string>;
    get activeCategory() {
        return this.__activeCategory.get();
    }
    set activeCategory(newValue: string) {
        this.__activeCategory.set(newValue);
    }
    private __coverage: ObservedPropertyObjectPU<LabCoverageReport>;
    get coverage() {
        return this.__coverage.get();
    }
    set coverage(newValue: LabCoverageReport) {
        this.__coverage.set(newValue);
    }
    private __showCoverage: ObservedPropertySimplePU<boolean>;
    get showCoverage() {
        return this.__showCoverage.get();
    }
    set showCoverage(newValue: boolean) {
        this.__showCoverage.set(newValue);
    }
    private __templateDir: ObservedPropertySimplePU<string>;
    get templateDir() {
        return this.__templateDir.get();
    }
    set templateDir(newValue: string) {
        this.__templateDir.set(newValue);
    }
    private __hexDir: ObservedPropertySimplePU<string>;
    get hexDir() {
        return this.__hexDir.get();
    }
    set hexDir(newValue: string) {
        this.__hexDir.set(newValue);
    }
    private appService: AppService;
    aboutToAppear(): void {
        this.templateDir = this.appService.getTemplateDir();
        this.hexDir = this.appService.getHexDir();
        void this.appService.ensureTemplatesReady().then(() => {
            this.refreshTemplates();
        });
    }
    private refreshTemplates(): void {
        this.templateDir = this.appService.getTemplateDir();
        this.hexDir = this.appService.getHexDir();
        this.coverage = this.appService.teachingService.getCoverageReport();
        this.templates = this.appService.listAvailableLabTemplates(this.activeCategory);
    }
    /** 需烧录固件的模板标注：文件名 + 就绪状态 */
    private getTemplateHexHint(tpl: LabTemplate): string {
        const hexName = tpl.hexFile !== undefined && tpl.hexFile.length > 0
            ? tpl.hexFile
            : this.appService.teachingService.getTemplateHexFileName(tpl.id);
        if (hexName === null || hexName.length === 0) {
            return '';
        }
        const fw = tpl.firmware !== undefined && tpl.firmware.length > 0
            ? tpl.firmware
            : (this.appService.teachingService.getTemplateFirmware(tpl.id)?.mcuFamily ?? '');
        const fwTag = fw.length > 0 ? `（${fw}）` : '';
        const hexPath = this.appService.getTemplateHexPath(tpl.id);
        const ready = hexPath !== null && this.appService.isHexFileReady(hexPath);
        if (ready) {
            return `需烧录: ${hexName}${fwTag}`;
        }
        return `需烧录: ${hexName}${fwTag}（文件缺失）`;
    }
    private templateNeedsHex(tpl: LabTemplate): boolean {
        if (tpl.hexFile !== undefined && tpl.hexFile.length > 0) {
            return true;
        }
        const name = this.appService.teachingService.getTemplateHexFileName(tpl.id);
        return name !== null && name.length > 0;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.alignItems(HorizontalAlign.Start);
            Column.width('100%');
            Column.padding({ bottom: 12 });
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: '教学辅助' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 83, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '教学辅助'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '教学辅助'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`器件库覆盖 ${this.coverage.percent}% (${this.coverage.covered.length}/${this.coverage.total})`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.coverage.percent >= 100 ? ProteusColors.ERC_OK : ProteusColors.TEXT_LABEL);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.showCoverage ? '收起' : '详情',
                        widthVal: 48,
                        onAction: () => { this.showCoverage = !this.showCoverage; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 90, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.showCoverage ? '收起' : '详情',
                            widthVal: 48,
                            onAction: () => { this.showCoverage = !this.showCoverage; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.showCoverage ? '收起' : '详情',
                        widthVal: 48
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showCoverage && this.coverage.missing.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`未覆盖: ${this.coverage.missing.join(', ')}`);
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.padding({ left: 8, right: 8 });
                        Text.width('100%');
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
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('实验模板库');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`模板: ${this.templateDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.width('100%');
            Text.maxLines(2);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`固件: ${this.hexDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8, bottom: 4 });
            Text.width('100%');
            Text.maxLines(2);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.scrollable(ScrollDirection.Horizontal);
            Scroll.scrollBar(BarState.Off);
            Scroll.width('100%');
            Scroll.height(32);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const cat = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(CATEGORY_LABELS.get(cat) ?? cat);
                    Text.fontSize(10);
                    Text.fontColor(this.activeCategory === cat ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_LABEL);
                    Text.backgroundColor(this.activeCategory === cat ? ProteusColors.INPUT_READONLY_BG : 'transparent');
                    Text.padding({ left: 8, right: 8, top: 4, bottom: 4 });
                    Text.border({
                        width: 1,
                        color: this.activeCategory === cat ? ProteusColors.SELECTED : ProteusColors.DIVIDER
                    });
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
            Column.create({ space: 4 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const tpl = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Row.create();
                    Row.width('100%');
                    Row.padding({ left: 6, right: 6, top: 6, bottom: 6 });
                    Row.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                    Row.border({ width: 1, color: ProteusColors.DIVIDER });
                }, Row);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Column.create({ space: 2 });
                    Column.alignItems(HorizontalAlign.Start);
                    Column.layoutWeight(1);
                }, Column);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Row.create({ space: 6 });
                }, Row);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(tpl.name);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                    Text.fontWeight(FontWeight.Medium);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(tpl.category);
                    Text.fontSize(9);
                    Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    Text.padding({ left: 4, right: 4, top: 1, bottom: 1 });
                    Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    If.create();
                    if (this.templateNeedsHex(tpl)) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create('需烧录');
                                Text.fontSize(9);
                                Text.fontColor('#FFFFFF');
                                Text.fontWeight(FontWeight.Medium);
                                Text.padding({ left: 5, right: 5, top: 1, bottom: 1 });
                                Text.backgroundColor(ProteusColors.ERC_WARN);
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
                Row.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Text.create(tpl.description);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(ProteusColors.TEXT_LABEL);
                    Text.maxLines(2);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    If.create();
                    if (tpl.libraryIds !== undefined && tpl.libraryIds.length > 0) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(`${tpl.libraryIds.length} 种器件`);
                                Text.fontSize(9);
                                Text.fontColor(ProteusColors.TEXT_SECONDARY);
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
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    If.create();
                    if (this.templateNeedsHex(tpl)) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(this.getTemplateHexHint(tpl));
                                Text.fontSize(10);
                                Text.fontColor(ProteusColors.ERC_WARN);
                                Text.fontWeight(FontWeight.Medium);
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
                {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        if (isInitialRender) {
                            let componentCall = new ProteusClassicBtn(this, {
                                label: '插入',
                                widthVal: 52,
                                onAction: () => {
                                    void this.appService.ensureTemplatesReady()
                                        .then(() => this.appService.loadLabTemplate(tpl.id))
                                        .then((r) => {
                                        if (!r) {
                                            this.statusMessage =
                                                `模板插入失败: ${this.templateDir}/${tpl.id}.schsim`;
                                        }
                                        else {
                                            this.refreshTemplates();
                                        }
                                    });
                                }
                            }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 194, col: 13 });
                            ViewPU.create(componentCall);
                            let paramsLambda = () => {
                                return {
                                    label: '插入',
                                    widthVal: 52,
                                    onAction: () => {
                                        void this.appService.ensureTemplatesReady()
                                            .then(() => this.appService.loadLabTemplate(tpl.id))
                                            .then((r) => {
                                            if (!r) {
                                                this.statusMessage =
                                                    `模板插入失败: ${this.templateDir}/${tpl.id}.schsim`;
                                            }
                                            else {
                                                this.refreshTemplates();
                                            }
                                        });
                                    }
                                };
                            };
                            componentCall.paramsGenerator_ = paramsLambda;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(elmtId, {
                                label: '插入',
                                widthVal: 52
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
                Row.pop();
            };
            this.forEachUpdateFunction(elmtId, this.templates, forEachItemGenFunction, (tpl: LabTemplate) => tpl.id, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('分步上电仿真');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('逐步给电路上电，观察各节点电压变化，适合教学演示');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '上一步',
                        widthVal: '30%',
                        onAction: () => {
                            if (this.stepIndex > 0) {
                                this.stepIndex--;
                            }
                            this.appService.stepPowerOn(this.stepIndex);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 236, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '上一步',
                            widthVal: '30%',
                            onAction: () => {
                                if (this.stepIndex > 0) {
                                    this.stepIndex--;
                                }
                                this.appService.stepPowerOn(this.stepIndex);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '上一步',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`步骤 ${this.stepIndex + 1}`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.textAlign(TextAlign.Center);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '下一步',
                        widthVal: '30%',
                        onAction: () => {
                            this.stepIndex++;
                            this.appService.stepPowerOn(this.stepIndex);
                            this.statusMessage = `分步上电: 步骤 ${this.stepIndex + 1}`;
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 252, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '下一步',
                            widthVal: '30%',
                            onAction: () => {
                                this.stepIndex++;
                                this.appService.stepPowerOn(this.stepIndex);
                                this.statusMessage = `分步上电: 步骤 ${this.stepIndex + 1}`;
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '下一步',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.selectedComponentId.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                    }, Divider);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('器件学习工具');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.fontWeight(FontWeight.Medium);
                        Text.padding({ left: 8 });
                        Text.alignSelf(ItemAlign.Start);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 6 });
                        Column.width('100%');
                        Column.padding({ left: 8, right: 8 });
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: '查看知识点',
                                    widthVal: '92%',
                                    onAction: () => {
                                        const dev = this.appService.getTopology().deviceList
                                            .find(d => d.instUuid === this.selectedComponentId);
                                        if (dev) {
                                            this.tip = this.appService.teachingService.getKnowledgeTip(dev.libDevId);
                                        }
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 276, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: '查看知识点',
                                        widthVal: '92%',
                                        onAction: () => {
                                            const dev = this.appService.getTopology().deviceList
                                                .find(d => d.instUuid === this.selectedComponentId);
                                            if (dev) {
                                                this.tip = this.appService.teachingService.getKnowledgeTip(dev.libDevId);
                                            }
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: '查看知识点',
                                    widthVal: '92%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, {
                                    label: 'AI 答疑',
                                    widthVal: '92%',
                                    onAction: async () => {
                                        const q = this.appService.teachingService.buildAiQuestion(this.appService.getTopology(), this.selectedComponentId);
                                        this.statusMessage = `AI 提问: ${q.substring(0, 40)}...`;
                                        await this.appService.aiGenerateCircuit(q);
                                    }
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 287, col: 11 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: 'AI 答疑',
                                        widthVal: '92%',
                                        onAction: async () => {
                                            const q = this.appService.teachingService.buildAiQuestion(this.appService.getTopology(), this.selectedComponentId);
                                            this.statusMessage = `AI 提问: ${q.substring(0, 40)}...`;
                                            await this.appService.aiGenerateCircuit(q);
                                        }
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: 'AI 答疑',
                                    widthVal: '92%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.tip) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create({ space: 4 });
                        Column.width('92%');
                        Column.padding({ left: 8, right: 8, top: 8, bottom: 8 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.margin({ left: 8, top: 4 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.tip.title);
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontWeight(FontWeight.Medium);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.tip.content);
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                    }, Text);
                    Text.pop();
                    Column.pop();
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
