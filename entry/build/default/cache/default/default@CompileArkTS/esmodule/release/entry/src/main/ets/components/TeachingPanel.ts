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
    constructor(g172, h172, i172, j172 = -1, k172 = undefined, l172) {
        super(g172, i172, j172, l172);
        if (typeof k172 === "function") {
            this.paramsGenerator_ = k172;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(h172.statusMessage, this, "statusMessage");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(h172.selectedComponentId, this, "selectedComponentId");
        this.__templates = new ObservedPropertyObjectPU([], this, "templates");
        this.__tip = new ObservedPropertyObjectPU(null, this, "tip");
        this.__stepIndex = new ObservedPropertySimplePU(0, this, "stepIndex");
        this.__activeCategory = new ObservedPropertySimplePU('all', this, "activeCategory");
        this.__coverage = new ObservedPropertyObjectPU({ covered: [], missing: [], total: 0, percent: 0 }, this, "coverage");
        this.__showCoverage = new ObservedPropertySimplePU(false, this, "showCoverage");
        this.__templateDir = new ObservedPropertySimplePU('', this, "templateDir");
        this.__hexDir = new ObservedPropertySimplePU('', this, "hexDir");
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(h172);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(f172: TeachingPanel_Params) {
        if (f172.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (f172.templates !== undefined) {
            this.templates = f172.templates;
        }
        if (f172.tip !== undefined) {
            this.tip = f172.tip;
        }
        if (f172.stepIndex !== undefined) {
            this.stepIndex = f172.stepIndex;
        }
        if (f172.activeCategory !== undefined) {
            this.activeCategory = f172.activeCategory;
        }
        if (f172.coverage !== undefined) {
            this.coverage = f172.coverage;
        }
        if (f172.showCoverage !== undefined) {
            this.showCoverage = f172.showCoverage;
        }
        if (f172.templateDir !== undefined) {
            this.templateDir = f172.templateDir;
        }
        if (f172.hexDir !== undefined) {
            this.hexDir = f172.hexDir;
        }
        if (f172.appService !== undefined) {
            this.appService = f172.appService;
        }
    }
    updateStateVars(e172: TeachingPanel_Params) {
        this.__selectedComponentId.reset(e172.selectedComponentId);
    }
    purgeVariableDependenciesOnElmtId(d172) {
        this.__statusMessage.purgeDependencyOnElmtId(d172);
        this.__selectedComponentId.purgeDependencyOnElmtId(d172);
        this.__templates.purgeDependencyOnElmtId(d172);
        this.__tip.purgeDependencyOnElmtId(d172);
        this.__stepIndex.purgeDependencyOnElmtId(d172);
        this.__activeCategory.purgeDependencyOnElmtId(d172);
        this.__coverage.purgeDependencyOnElmtId(d172);
        this.__showCoverage.purgeDependencyOnElmtId(d172);
        this.__templateDir.purgeDependencyOnElmtId(d172);
        this.__hexDir.purgeDependencyOnElmtId(d172);
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
    set statusMessage(c172: string) {
        this.__statusMessage.set(c172);
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(b172: string) {
        this.__selectedComponentId.set(b172);
    }
    private __templates: ObservedPropertyObjectPU<LabTemplate[]>;
    get templates() {
        return this.__templates.get();
    }
    set templates(a172: LabTemplate[]) {
        this.__templates.set(a172);
    }
    private __tip: ObservedPropertyObjectPU<KnowledgeTip | null>;
    get tip() {
        return this.__tip.get();
    }
    set tip(z171: KnowledgeTip | null) {
        this.__tip.set(z171);
    }
    private __stepIndex: ObservedPropertySimplePU<number>;
    get stepIndex() {
        return this.__stepIndex.get();
    }
    set stepIndex(y171: number) {
        this.__stepIndex.set(y171);
    }
    private __activeCategory: ObservedPropertySimplePU<string>;
    get activeCategory() {
        return this.__activeCategory.get();
    }
    set activeCategory(x171: string) {
        this.__activeCategory.set(x171);
    }
    private __coverage: ObservedPropertyObjectPU<LabCoverageReport>;
    get coverage() {
        return this.__coverage.get();
    }
    set coverage(w171: LabCoverageReport) {
        this.__coverage.set(w171);
    }
    private __showCoverage: ObservedPropertySimplePU<boolean>;
    get showCoverage() {
        return this.__showCoverage.get();
    }
    set showCoverage(v171: boolean) {
        this.__showCoverage.set(v171);
    }
    private __templateDir: ObservedPropertySimplePU<string>;
    get templateDir() {
        return this.__templateDir.get();
    }
    set templateDir(u171: string) {
        this.__templateDir.set(u171);
    }
    private __hexDir: ObservedPropertySimplePU<string>;
    get hexDir() {
        return this.__hexDir.get();
    }
    set hexDir(t171: string) {
        this.__hexDir.set(t171);
    }
    private appService: AppService;
    aboutToAppear(): void {
        this.templateDir = this.appService.getTemplateDir();
        this.hexDir = this.appService.getHexDir();
        this.refreshTemplates();
    }
    private refreshTemplates(): void {
        this.templateDir = this.appService.getTemplateDir();
        this.hexDir = this.appService.getHexDir();
        this.coverage = this.appService.teachingService.getCoverageReport();
        this.templates = this.appService.listAvailableLabTemplates(this.activeCategory);
    }
    private getTemplateHexHint(r171: string): string {
        const s171 = this.appService.getTemplateHexPath(r171);
        if (s171 === null) {
            return '';
        }
        if (this.appService.isHexFileReady(s171)) {
            return `HEX: ${s171}`;
        }
        return `HEX 缺失: ${s171}`;
    }
    initialRender() {
        this.observeComponentCreation2((p171, q171) => {
            Column.create({ space: 6 });
            Column.alignItems(HorizontalAlign.Start);
            Column.width('100%');
            Column.padding({ bottom: 12 });
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        {
            this.observeComponentCreation2((l171, m171) => {
                if (m171) {
                    let n171 = new ProteusSectionTitle(this, { title: '教学辅助' }, undefined, l171, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 64, col: 7 });
                    ViewPU.create(n171);
                    let o171 = () => {
                        return {
                            title: '教学辅助'
                        };
                    };
                    n171.paramsGenerator_ = o171;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(l171, {
                        title: '教学辅助'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((j171, k171) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((h171, i171) => {
            Text.create(`器件库覆盖 ${this.coverage.percent}% (${this.coverage.covered.length}/${this.coverage.total})`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.coverage.percent >= 100 ? ProteusColors.ERC_OK : ProteusColors.TEXT_LABEL);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((d171, e171) => {
                if (e171) {
                    let f171 = new ProteusClassicBtn(this, {
                        label: this.showCoverage ? '收起' : '详情',
                        widthVal: 48,
                        onAction: () => { this.showCoverage = !this.showCoverage; }
                    }, undefined, d171, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 71, col: 9 });
                    ViewPU.create(f171);
                    let g171 = () => {
                        return {
                            label: this.showCoverage ? '收起' : '详情',
                            widthVal: 48,
                            onAction: () => { this.showCoverage = !this.showCoverage; }
                        };
                    };
                    f171.paramsGenerator_ = g171;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(d171, {
                        label: this.showCoverage ? '收起' : '详情',
                        widthVal: 48
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((z170, a171) => {
            If.create();
            if (this.showCoverage && this.coverage.missing.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((b171, c171) => {
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
        this.observeComponentCreation2((x170, y170) => {
            Text.create('实验模板库');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((v170, w170) => {
            Text.create(`模板: ${this.templateDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.width('100%');
            Text.maxLines(2);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t170, u170) => {
            Text.create(`固件: ${this.hexDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8, bottom: 4 });
            Text.width('100%');
            Text.maxLines(2);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((r170, s170) => {
            Scroll.create();
            Scroll.scrollable(ScrollDirection.Horizontal);
            Scroll.scrollBar(BarState.Off);
            Scroll.width('100%');
            Scroll.height(32);
        }, Scroll);
        this.observeComponentCreation2((p170, q170) => {
            Row.create({ space: 4 });
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((h170, i170) => {
            ForEach.create();
            const j170 = l170 => {
                const m170 = l170;
                this.observeComponentCreation2((n170, o170) => {
                    Text.create(CATEGORY_LABELS.get(m170) ?? m170);
                    Text.fontSize(10);
                    Text.fontColor(this.activeCategory === m170 ? ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_LABEL);
                    Text.backgroundColor(this.activeCategory === m170 ? ProteusColors.INPUT_READONLY_BG : 'transparent');
                    Text.padding({ left: 8, right: 8, top: 4, bottom: 4 });
                    Text.border({
                        width: 1,
                        color: this.activeCategory === m170 ? ProteusColors.SELECTED : ProteusColors.DIVIDER
                    });
                    Text.onClick(() => {
                        this.activeCategory = m170;
                        this.refreshTemplates();
                    });
                }, Text);
                Text.pop();
            };
            this.forEachUpdateFunction(h170, Array.from(CATEGORY_LABELS.keys()), j170, (k170: string) => k170, false, false);
        }, ForEach);
        ForEach.pop();
        Row.pop();
        Scroll.pop();
        this.observeComponentCreation2((f170, g170) => {
            Column.create({ space: 4 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8 });
        }, Column);
        this.observeComponentCreation2((z168, a169) => {
            ForEach.create();
            const b169 = d169 => {
                const e169 = d169;
                this.observeComponentCreation2((d170, e170) => {
                    Row.create();
                    Row.width('100%');
                    Row.padding({ left: 6, right: 6, top: 6, bottom: 6 });
                    Row.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                    Row.border({ width: 1, color: ProteusColors.DIVIDER });
                }, Row);
                this.observeComponentCreation2((b170, c170) => {
                    Column.create({ space: 2 });
                    Column.alignItems(HorizontalAlign.Start);
                    Column.layoutWeight(1);
                }, Column);
                this.observeComponentCreation2((z169, a170) => {
                    Row.create({ space: 6 });
                }, Row);
                this.observeComponentCreation2((x169, y169) => {
                    Text.create(e169.name);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                    Text.fontWeight(FontWeight.Medium);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((v169, w169) => {
                    Text.create(e169.category);
                    Text.fontSize(9);
                    Text.fontColor(ProteusColors.TEXT_SECONDARY);
                    Text.padding({ left: 4, right: 4, top: 1, bottom: 1 });
                    Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                }, Text);
                Text.pop();
                Row.pop();
                this.observeComponentCreation2((t169, u169) => {
                    Text.create(e169.description);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(ProteusColors.TEXT_LABEL);
                    Text.maxLines(2);
                }, Text);
                Text.pop();
                this.observeComponentCreation2((p169, q169) => {
                    If.create();
                    if (e169.libraryIds !== undefined && e169.libraryIds.length > 0) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((r169, s169) => {
                                Text.create(`${e169.libraryIds.length} 种器件`);
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
                this.observeComponentCreation2((l169, m169) => {
                    If.create();
                    if (this.getTemplateHexHint(e169.id).length > 0) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((n169, o169) => {
                                Text.create(this.getTemplateHexHint(e169.id));
                                Text.fontSize(9);
                                Text.fontColor(ProteusColors.TEXT_SECONDARY);
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
                    this.observeComponentCreation2((f169, g169) => {
                        if (g169) {
                            let h169 = new ProteusClassicBtn(this, {
                                label: '插入',
                                widthVal: 52,
                                onAction: () => {
                                    void this.appService.loadLabTemplate(e169.id).then((k169) => {
                                        if (!k169) {
                                            this.statusMessage =
                                                `模板插入失败: ${this.templateDir}/${e169.id}.schsim`;
                                        }
                                    });
                                }
                            }, undefined, f169, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 166, col: 13 });
                            ViewPU.create(h169);
                            let i169 = () => {
                                return {
                                    label: '插入',
                                    widthVal: 52,
                                    onAction: () => {
                                        void this.appService.loadLabTemplate(e169.id).then((j169) => {
                                            if (!j169) {
                                                this.statusMessage =
                                                    `模板插入失败: ${this.templateDir}/${e169.id}.schsim`;
                                            }
                                        });
                                    }
                                };
                            };
                            h169.paramsGenerator_ = i169;
                        }
                        else {
                            this.updateStateVarsOfChildByElmtId(f169, {
                                label: '插入',
                                widthVal: 52
                            });
                        }
                    }, { name: "ProteusClassicBtn" });
                }
                Row.pop();
            };
            this.forEachUpdateFunction(z168, this.templates, b169, (c169: LabTemplate) => c169.id, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
        this.observeComponentCreation2((x168, y168) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((v168, w168) => {
            Text.create('分步上电仿真');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t168, u168) => {
            Text.create('逐步给电路上电，观察各节点电压变化，适合教学演示');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((r168, s168) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        {
            this.observeComponentCreation2((n168, o168) => {
                if (o168) {
                    let p168 = new ProteusClassicBtn(this, {
                        label: '上一步',
                        widthVal: '30%',
                        onAction: () => {
                            if (this.stepIndex > 0) {
                                this.stepIndex--;
                            }
                            this.appService.stepPowerOn(this.stepIndex);
                        }
                    }, undefined, n168, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 204, col: 9 });
                    ViewPU.create(p168);
                    let q168 = () => {
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
                    p168.paramsGenerator_ = q168;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n168, {
                        label: '上一步',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((l168, m168) => {
            Text.create(`步骤 ${this.stepIndex + 1}`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.textAlign(TextAlign.Center);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((h168, i168) => {
                if (i168) {
                    let j168 = new ProteusClassicBtn(this, {
                        label: '下一步',
                        widthVal: '30%',
                        onAction: () => {
                            this.stepIndex++;
                            this.appService.stepPowerOn(this.stepIndex);
                            this.statusMessage = `分步上电: 步骤 ${this.stepIndex + 1}`;
                        }
                    }, undefined, h168, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 220, col: 9 });
                    ViewPU.create(j168);
                    let k168 = () => {
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
                    j168.paramsGenerator_ = k168;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(h168, {
                        label: '下一步',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((l167, m167) => {
            If.create();
            if (this.selectedComponentId.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((f168, g168) => {
                        Divider.create();
                        Divider.color(ProteusColors.DIVIDER);
                        Divider.height(1);
                        Divider.width('100%');
                    }, Divider);
                    this.observeComponentCreation2((d168, e168) => {
                        Text.create('器件学习工具');
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.fontWeight(FontWeight.Medium);
                        Text.padding({ left: 8 });
                        Text.alignSelf(ItemAlign.Start);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((b168, c168) => {
                        Column.create({ space: 6 });
                        Column.width('100%');
                        Column.padding({ left: 8, right: 8 });
                        Column.alignItems(HorizontalAlign.Start);
                    }, Column);
                    {
                        this.observeComponentCreation2((t167, u167) => {
                            if (u167) {
                                let v167 = new ProteusClassicBtn(this, {
                                    label: '查看知识点',
                                    widthVal: '92%',
                                    onAction: () => {
                                        const z167 = this.appService.getTopology().deviceList
                                            .find(a168 => a168.instUuid === this.selectedComponentId);
                                        if (z167) {
                                            this.tip = this.appService.teachingService.getKnowledgeTip(z167.libDevId);
                                        }
                                    }
                                }, undefined, t167, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 244, col: 11 });
                                ViewPU.create(v167);
                                let w167 = () => {
                                    return {
                                        label: '查看知识点',
                                        widthVal: '92%',
                                        onAction: () => {
                                            const x167 = this.appService.getTopology().deviceList
                                                .find(y167 => y167.instUuid === this.selectedComponentId);
                                            if (x167) {
                                                this.tip = this.appService.teachingService.getKnowledgeTip(x167.libDevId);
                                            }
                                        }
                                    };
                                };
                                v167.paramsGenerator_ = w167;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(t167, {
                                    label: '查看知识点',
                                    widthVal: '92%'
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                    {
                        this.observeComponentCreation2((n167, o167) => {
                            if (o167) {
                                let p167 = new ProteusClassicBtn(this, {
                                    label: 'AI 答疑',
                                    widthVal: '92%',
                                    onAction: async () => {
                                        const s167 = this.appService.teachingService.buildAiQuestion(this.appService.getTopology(), this.selectedComponentId);
                                        this.statusMessage = `AI 提问: ${s167.substring(0, 40)}...`;
                                        await this.appService.aiGenerateCircuit(s167);
                                    }
                                }, undefined, n167, () => { }, { page: "entry/src/main/ets/components/TeachingPanel.ets", line: 255, col: 11 });
                                ViewPU.create(p167);
                                let q167 = () => {
                                    return {
                                        label: 'AI 答疑',
                                        widthVal: '92%',
                                        onAction: async () => {
                                            const r167 = this.appService.teachingService.buildAiQuestion(this.appService.getTopology(), this.selectedComponentId);
                                            this.statusMessage = `AI 提问: ${r167.substring(0, 40)}...`;
                                            await this.appService.aiGenerateCircuit(r167);
                                        }
                                    };
                                };
                                p167.paramsGenerator_ = q167;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(n167, {
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
        this.observeComponentCreation2((d167, e167) => {
            If.create();
            if (this.tip) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((j167, k167) => {
                        Column.create({ space: 4 });
                        Column.width('92%');
                        Column.padding({ left: 8, right: 8, top: 8, bottom: 8 });
                        Column.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Column.border({ width: 1, color: ProteusColors.DIVIDER });
                        Column.margin({ left: 8, top: 4 });
                    }, Column);
                    this.observeComponentCreation2((h167, i167) => {
                        Text.create(this.tip.title);
                        Text.fontSize(ProteusFonts.PARAM_KEY);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontWeight(FontWeight.Medium);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((f167, g167) => {
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
