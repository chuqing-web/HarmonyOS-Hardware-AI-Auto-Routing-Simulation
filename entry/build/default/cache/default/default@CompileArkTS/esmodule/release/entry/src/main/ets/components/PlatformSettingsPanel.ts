if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PlatformSettingsPanel_Params {
    statusMessage?: string;
    themeRefreshKey?: number;
    offlineMode?: boolean;
    globalProxy?: string;
    highContrast?: boolean;
    uiScale?: number;
    screenReader?: boolean;
    paperSize?: string;
    darkTheme?: boolean;
    appService?: AppService;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { AccessibilityConfig } from 'common';
import { ProteusClassicBtn, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { ThemeManager } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
export class PlatformSettingsPanel extends ViewPU {
    constructor(n108, o108, p108, q108 = -1, r108 = undefined, s108) {
        super(n108, p108, q108, s108);
        if (typeof r108 === "function") {
            this.paramsGenerator_ = r108;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(o108.statusMessage, this, "statusMessage");
        this.__themeRefreshKey = new SynchedPropertySimpleTwoWayPU(o108.themeRefreshKey, this, "themeRefreshKey");
        this.__offlineMode = new ObservedPropertySimplePU(false, this, "offlineMode");
        this.__globalProxy = new ObservedPropertySimplePU('', this, "globalProxy");
        this.__highContrast = new ObservedPropertySimplePU(false, this, "highContrast");
        this.__uiScale = new ObservedPropertySimplePU(100, this, "uiScale");
        this.__screenReader = new ObservedPropertySimplePU(false, this, "screenReader");
        this.__paperSize = new ObservedPropertySimplePU('A4', this, "paperSize");
        this.__darkTheme = new ObservedPropertySimplePU(ThemeManager.getInstance().isDark(), this, "darkTheme");
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(o108);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(m108: PlatformSettingsPanel_Params) {
        if (m108.offlineMode !== undefined) {
            this.offlineMode = m108.offlineMode;
        }
        if (m108.globalProxy !== undefined) {
            this.globalProxy = m108.globalProxy;
        }
        if (m108.highContrast !== undefined) {
            this.highContrast = m108.highContrast;
        }
        if (m108.uiScale !== undefined) {
            this.uiScale = m108.uiScale;
        }
        if (m108.screenReader !== undefined) {
            this.screenReader = m108.screenReader;
        }
        if (m108.paperSize !== undefined) {
            this.paperSize = m108.paperSize;
        }
        if (m108.darkTheme !== undefined) {
            this.darkTheme = m108.darkTheme;
        }
        if (m108.appService !== undefined) {
            this.appService = m108.appService;
        }
    }
    updateStateVars(l108: PlatformSettingsPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(k108) {
        this.__statusMessage.purgeDependencyOnElmtId(k108);
        this.__themeRefreshKey.purgeDependencyOnElmtId(k108);
        this.__offlineMode.purgeDependencyOnElmtId(k108);
        this.__globalProxy.purgeDependencyOnElmtId(k108);
        this.__highContrast.purgeDependencyOnElmtId(k108);
        this.__uiScale.purgeDependencyOnElmtId(k108);
        this.__screenReader.purgeDependencyOnElmtId(k108);
        this.__paperSize.purgeDependencyOnElmtId(k108);
        this.__darkTheme.purgeDependencyOnElmtId(k108);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__themeRefreshKey.aboutToBeDeleted();
        this.__offlineMode.aboutToBeDeleted();
        this.__globalProxy.aboutToBeDeleted();
        this.__highContrast.aboutToBeDeleted();
        this.__uiScale.aboutToBeDeleted();
        this.__screenReader.aboutToBeDeleted();
        this.__paperSize.aboutToBeDeleted();
        this.__darkTheme.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(j108: string) {
        this.__statusMessage.set(j108);
    }
    private __themeRefreshKey: SynchedPropertySimpleTwoWayPU<number>;
    get themeRefreshKey() {
        return this.__themeRefreshKey.get();
    }
    set themeRefreshKey(i108: number) {
        this.__themeRefreshKey.set(i108);
    }
    private __offlineMode: ObservedPropertySimplePU<boolean>;
    get offlineMode() {
        return this.__offlineMode.get();
    }
    set offlineMode(h108: boolean) {
        this.__offlineMode.set(h108);
    }
    private __globalProxy: ObservedPropertySimplePU<string>;
    get globalProxy() {
        return this.__globalProxy.get();
    }
    set globalProxy(g108: string) {
        this.__globalProxy.set(g108);
    }
    private __highContrast: ObservedPropertySimplePU<boolean>;
    get highContrast() {
        return this.__highContrast.get();
    }
    set highContrast(f108: boolean) {
        this.__highContrast.set(f108);
    }
    private __uiScale: ObservedPropertySimplePU<number>;
    get uiScale() {
        return this.__uiScale.get();
    }
    set uiScale(e108: number) {
        this.__uiScale.set(e108);
    }
    private __screenReader: ObservedPropertySimplePU<boolean>;
    get screenReader() {
        return this.__screenReader.get();
    }
    set screenReader(d108: boolean) {
        this.__screenReader.set(d108);
    }
    private __paperSize: ObservedPropertySimplePU<string>;
    get paperSize() {
        return this.__paperSize.get();
    }
    set paperSize(c108: string) {
        this.__paperSize.set(c108);
    }
    private __darkTheme: ObservedPropertySimplePU<boolean>;
    get darkTheme() {
        return this.__darkTheme.get();
    }
    set darkTheme(b108: boolean) {
        this.__darkTheme.set(b108);
    }
    private appService: AppService;
    initialRender() {
        this.observeComponentCreation2((z107, a108) => {
            Column.create({ space: 0 });
            Column.alignItems(HorizontalAlign.Start);
            Column.width('100%');
            Column.padding({ bottom: 12 });
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        {
            this.observeComponentCreation2((v107, w107) => {
                if (w107) {
                    let x107 = new ProteusSectionTitle(this, { title: '平台设置' }, undefined, v107, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 26, col: 7 });
                    ViewPU.create(x107);
                    let y107 = () => {
                        return {
                            title: '平台设置'
                        };
                    };
                    x107.paramsGenerator_ = y107;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(v107, {
                        title: '平台设置'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((t107, u107) => {
            Column.create();
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((r107, s107) => {
            Text.create('外观主题');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 4, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((p107, q107) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((n107, o107) => {
            Text.create('深色主题');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((l107, m107) => {
            Text.create(this.darkTheme ? '已启用' : '未启用');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((i107, j107) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.darkTheme });
            Toggle.onChange((k107: boolean) => {
                this.darkTheme = k107;
                ThemeManager.getInstance().setMode(k107 ? 'dark' : 'light');
                this.themeRefreshKey++;
                this.statusMessage = k107 ? '已启用深色主题' : '已启用浅色主题';
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        Column.pop();
        this.observeComponentCreation2((g107, h107) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((e107, f107) => {
            Column.create();
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((c107, d107) => {
            Text.create('网络与 AI');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 6, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((a107, b107) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((y106, z106) => {
            Text.create('离线模式');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((w106, x106) => {
            Text.create(this.offlineMode ? '仅本地计算' : '联网可用');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t106, u106) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.offlineMode });
            Toggle.onChange((v106: boolean) => {
                this.offlineMode = v106;
                this.appService.setOfflineMode(v106);
                this.statusMessage = v106 ? '已开启离线模式（仅本地）' : '已关闭离线模式';
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        this.observeComponentCreation2((r106, s106) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4 });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((p106, q106) => {
            Text.create('全局代理');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((m106, n106) => {
            TextInput.create({ text: this.globalProxy, placeholder: 'http://127.0.0.1:7890' });
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.layoutWeight(1);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((o106: string) => { this.globalProxy = o106; });
        }, TextInput);
        Row.pop();
        this.observeComponentCreation2((k106, l106) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 4 });
        }, __Common__);
        {
            this.observeComponentCreation2((g106, h106) => {
                if (h106) {
                    let i106 = new ProteusClassicBtn(this, {
                        label: '应用代理设置',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.setGlobalProxy(this.globalProxy);
                            this.statusMessage = '代理已更新';
                        }
                    }, undefined, g106, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 108, col: 11 });
                    ViewPU.create(i106);
                    let j106 = () => {
                        return {
                            label: '应用代理设置',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.setGlobalProxy(this.globalProxy);
                                this.statusMessage = '代理已更新';
                            }
                        };
                    };
                    i106.paramsGenerator_ = j106;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(g106, {
                        label: '应用代理设置',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        Column.pop();
        this.observeComponentCreation2((e106, f106) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((c106, d106) => {
            Column.create();
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((a106, b106) => {
            Text.create('无障碍');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 6, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((y105, z105) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((w105, x105) => {
            Text.create('高对比度');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t105, u105) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.highContrast });
            Toggle.onChange((v105: boolean) => {
                this.highContrast = v105;
                this.applyAccessibility();
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        this.observeComponentCreation2((r105, s105) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((p105, q105) => {
            Text.create(`UI 缩放: ${this.uiScale}%`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.width(110);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((m105, n105) => {
            Slider.create({ value: this.uiScale, min: 100, max: 150, step: 25 });
            Slider.layoutWeight(1);
            Slider.onChange((o105: number) => {
                this.uiScale = o105;
                this.applyAccessibility();
            });
        }, Slider);
        Row.pop();
        this.observeComponentCreation2((k105, l105) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((i105, j105) => {
            Text.create('语音朗读');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((f105, g105) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.screenReader });
            Toggle.onChange((h105: boolean) => {
                this.screenReader = h105;
                this.applyAccessibility();
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        Column.pop();
        this.observeComponentCreation2((d105, e105) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((b105, c105) => {
            Column.create();
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((z104, a105) => {
            Text.create('版本与隐私');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 6, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((x104, y104) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 4, bottom: 12 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((t104, u104) => {
                if (u104) {
                    let v104 = new ProteusClassicBtn(this, {
                        label: '保存快照',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.saveSnapshot('手动快照', '用户手动保存');
                            this.statusMessage = '版本快照已保存';
                        }
                    }, undefined, t104, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 188, col: 13 });
                    ViewPU.create(v104);
                    let w104 = () => {
                        return {
                            label: '保存快照',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.saveSnapshot('手动快照', '用户手动保存');
                                this.statusMessage = '版本快照已保存';
                            }
                        };
                    };
                    v104.paramsGenerator_ = w104;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(t104, {
                        label: '保存快照',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((p104, q104) => {
                if (q104) {
                    let r104 = new ProteusClassicBtn(this, {
                        label: '隐私清理',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.privacyCleanup();
                            this.statusMessage = '已清理 AI 缓存与临时文件';
                        }
                    }, undefined, p104, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 196, col: 13 });
                    ViewPU.create(r104);
                    let s104 = () => {
                        return {
                            label: '隐私清理',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.privacyCleanup();
                                this.statusMessage = '已清理 AI 缓存与临时文件';
                            }
                        };
                    };
                    r104.paramsGenerator_ = s104;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(p104, {
                        label: '隐私清理',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((l104, m104) => {
                if (m104) {
                    let n104 = new ProteusClassicBtn(this, {
                        label: '同意隐私政策',
                        widthVal: '92%',
                        onAction: () => {
                            void this.appService.acceptPrivacyPolicy();
                            this.statusMessage = '已记录隐私政策同意';
                        }
                    }, undefined, l104, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 204, col: 13 });
                    ViewPU.create(n104);
                    let o104 = () => {
                        return {
                            label: '同意隐私政策',
                            widthVal: '92%',
                            onAction: () => {
                                void this.appService.acceptPrivacyPolicy();
                                this.statusMessage = '已记录隐私政策同意';
                            }
                        };
                    };
                    n104.paramsGenerator_ = o104;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(l104, {
                        label: '同意隐私政策',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Column.pop();
        Column.pop();
        Column.pop();
    }
    private applyAccessibility(): void {
        const k104: AccessibilityConfig = {
            highContrast: this.highContrast,
            keyboardOnly: false,
            uiScale: this.uiScale / 100,
            screenReader: this.screenReader
        };
        this.appService.setAccessibility(k104);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
