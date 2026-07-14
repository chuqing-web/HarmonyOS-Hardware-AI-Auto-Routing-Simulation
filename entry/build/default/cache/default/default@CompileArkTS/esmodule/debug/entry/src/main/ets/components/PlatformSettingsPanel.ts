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
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__themeRefreshKey = new SynchedPropertySimpleTwoWayPU(params.themeRefreshKey, this, "themeRefreshKey");
        this.__offlineMode = new ObservedPropertySimplePU(false, this, "offlineMode");
        this.__globalProxy = new ObservedPropertySimplePU('', this, "globalProxy");
        this.__highContrast = new ObservedPropertySimplePU(false, this, "highContrast");
        this.__uiScale = new ObservedPropertySimplePU(100, this, "uiScale");
        this.__screenReader = new ObservedPropertySimplePU(false, this, "screenReader");
        this.__paperSize = new ObservedPropertySimplePU('A4', this, "paperSize");
        this.__darkTheme = new ObservedPropertySimplePU(ThemeManager.getInstance().isDark(), this, "darkTheme");
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PlatformSettingsPanel_Params) {
        if (params.offlineMode !== undefined) {
            this.offlineMode = params.offlineMode;
        }
        if (params.globalProxy !== undefined) {
            this.globalProxy = params.globalProxy;
        }
        if (params.highContrast !== undefined) {
            this.highContrast = params.highContrast;
        }
        if (params.uiScale !== undefined) {
            this.uiScale = params.uiScale;
        }
        if (params.screenReader !== undefined) {
            this.screenReader = params.screenReader;
        }
        if (params.paperSize !== undefined) {
            this.paperSize = params.paperSize;
        }
        if (params.darkTheme !== undefined) {
            this.darkTheme = params.darkTheme;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
    }
    updateStateVars(params: PlatformSettingsPanel_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__themeRefreshKey.purgeDependencyOnElmtId(rmElmtId);
        this.__offlineMode.purgeDependencyOnElmtId(rmElmtId);
        this.__globalProxy.purgeDependencyOnElmtId(rmElmtId);
        this.__highContrast.purgeDependencyOnElmtId(rmElmtId);
        this.__uiScale.purgeDependencyOnElmtId(rmElmtId);
        this.__screenReader.purgeDependencyOnElmtId(rmElmtId);
        this.__paperSize.purgeDependencyOnElmtId(rmElmtId);
        this.__darkTheme.purgeDependencyOnElmtId(rmElmtId);
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
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __themeRefreshKey: SynchedPropertySimpleTwoWayPU<number>;
    get themeRefreshKey() {
        return this.__themeRefreshKey.get();
    }
    set themeRefreshKey(newValue: number) {
        this.__themeRefreshKey.set(newValue);
    }
    private __offlineMode: ObservedPropertySimplePU<boolean>;
    get offlineMode() {
        return this.__offlineMode.get();
    }
    set offlineMode(newValue: boolean) {
        this.__offlineMode.set(newValue);
    }
    private __globalProxy: ObservedPropertySimplePU<string>;
    get globalProxy() {
        return this.__globalProxy.get();
    }
    set globalProxy(newValue: string) {
        this.__globalProxy.set(newValue);
    }
    private __highContrast: ObservedPropertySimplePU<boolean>;
    get highContrast() {
        return this.__highContrast.get();
    }
    set highContrast(newValue: boolean) {
        this.__highContrast.set(newValue);
    }
    private __uiScale: ObservedPropertySimplePU<number>;
    get uiScale() {
        return this.__uiScale.get();
    }
    set uiScale(newValue: number) {
        this.__uiScale.set(newValue);
    }
    private __screenReader: ObservedPropertySimplePU<boolean>;
    get screenReader() {
        return this.__screenReader.get();
    }
    set screenReader(newValue: boolean) {
        this.__screenReader.set(newValue);
    }
    private __paperSize: ObservedPropertySimplePU<string>;
    get paperSize() {
        return this.__paperSize.get();
    }
    set paperSize(newValue: string) {
        this.__paperSize.set(newValue);
    }
    private __darkTheme: ObservedPropertySimplePU<boolean>;
    get darkTheme() {
        return this.__darkTheme.get();
    }
    set darkTheme(newValue: boolean) {
        this.__darkTheme.set(newValue);
    }
    private appService: AppService;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 0 });
            Column.alignItems(HorizontalAlign.Start);
            Column.width('100%');
            Column.padding({ bottom: 12 });
            Column.backgroundColor(ProteusColors.CANVAS_BG);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: '平台设置' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 26, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: '平台设置'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: '平台设置'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- 外观 ----
            Column.create();
            // ---- 外观 ----
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('外观主题');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 4, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('深色主题');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.darkTheme ? '已启用' : '未启用');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.darkTheme });
            Toggle.onChange((on: boolean) => {
                this.darkTheme = on;
                ThemeManager.getInstance().setMode(on ? 'dark' : 'light');
                this.themeRefreshKey++;
                this.statusMessage = on ? '已启用深色主题' : '已启用浅色主题';
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        // ---- 外观 ----
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- 网络与 AI ----
            Column.create();
            // ---- 网络与 AI ----
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('网络与 AI');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 6, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('离线模式');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.offlineMode ? '仅本地计算' : '联网可用');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.offlineMode });
            Toggle.onChange((on: boolean) => {
                this.offlineMode = on;
                this.appService.setOfflineMode(on);
                this.statusMessage = on ? '已开启离线模式（仅本地）' : '已关闭离线模式';
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4 });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('全局代理');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ text: this.globalProxy, placeholder: 'http://127.0.0.1:7890' });
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.layoutWeight(1);
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((v: string) => { this.globalProxy = v; });
        }, TextInput);
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 4 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '应用代理设置',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.setGlobalProxy(this.globalProxy);
                            this.statusMessage = '代理已更新';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 108, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '应用代理设置',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.setGlobalProxy(this.globalProxy);
                                this.statusMessage = '代理已更新';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '应用代理设置',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        // ---- 网络与 AI ----
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- 无障碍 ----
            Column.create();
            // ---- 无障碍 ----
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('无障碍');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 6, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('高对比度');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.highContrast });
            Toggle.onChange((on: boolean) => {
                this.highContrast = on;
                this.applyAccessibility();
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`UI 缩放: ${this.uiScale}%`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.width(110);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.uiScale, min: 100, max: 150, step: 25 });
            Slider.layoutWeight(1);
            Slider.onChange((v: number) => {
                this.uiScale = v;
                this.applyAccessibility();
            });
        }, Slider);
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4, bottom: 4 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('语音朗读');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.screenReader });
            Toggle.onChange((on: boolean) => {
                this.screenReader = on;
                this.applyAccessibility();
            });
        }, Toggle);
        Toggle.pop();
        Row.pop();
        // ---- 无障碍 ----
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // ---- 版本与隐私 ----
            Column.create();
            // ---- 版本与隐私 ----
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('版本与隐私');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.padding({ left: 8, top: 6, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 4, bottom: 12 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '保存快照',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.saveSnapshot('手动快照', '用户手动保存');
                            this.statusMessage = '版本快照已保存';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 188, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '保存快照',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.saveSnapshot('手动快照', '用户手动保存');
                                this.statusMessage = '版本快照已保存';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '保存快照',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '隐私清理',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.privacyCleanup();
                            this.statusMessage = '已清理 AI 缓存与临时文件';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 196, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '隐私清理',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.privacyCleanup();
                                this.statusMessage = '已清理 AI 缓存与临时文件';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '隐私清理',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '同意隐私政策',
                        widthVal: '92%',
                        onAction: () => {
                            void this.appService.acceptPrivacyPolicy();
                            this.statusMessage = '已记录隐私政策同意';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 204, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '同意隐私政策',
                            widthVal: '92%',
                            onAction: () => {
                                void this.appService.acceptPrivacyPolicy();
                                this.statusMessage = '已记录隐私政策同意';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '同意隐私政策',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Column.pop();
        // ---- 版本与隐私 ----
        Column.pop();
        Column.pop();
    }
    private applyAccessibility(): void {
        const cfg: AccessibilityConfig = {
            highContrast: this.highContrast,
            keyboardOnly: false,
            uiScale: this.uiScale / 100,
            screenReader: this.screenReader
        };
        this.appService.setAccessibility(cfg);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
