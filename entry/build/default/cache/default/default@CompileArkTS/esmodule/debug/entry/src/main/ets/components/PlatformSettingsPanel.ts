if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PlatformSettingsPanel_Params {
    statusMessage?: string;
    themeRefreshKey?: number;
    themeRev?: number;
    offlineMode?: boolean;
    globalProxy?: string;
    highContrast?: boolean;
    uiScale?: number;
    screenReader?: boolean;
    darkTheme?: boolean;
    appVersion?: string;
    appService?: AppService;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { appVersionLabel } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AccessibilityConfig } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusSectionTitle, ProteusSwitch, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { ThemeManager, PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
export class PlatformSettingsPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__themeRefreshKey = new SynchedPropertySimpleTwoWayPU(params.themeRefreshKey, this, "themeRefreshKey");
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__offlineMode = new ObservedPropertySimplePU(false, this, "offlineMode");
        this.__globalProxy = new ObservedPropertySimplePU('', this, "globalProxy");
        this.__highContrast = new ObservedPropertySimplePU(false, this, "highContrast");
        this.__uiScale = new ObservedPropertySimplePU(100, this, "uiScale");
        this.__screenReader = new ObservedPropertySimplePU(false, this, "screenReader");
        this.__darkTheme = new ObservedPropertySimplePU(false, this, "darkTheme");
        this.__appVersion = new ObservedPropertySimplePU(appVersionLabel(), this, "appVersion");
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
        if (params.darkTheme !== undefined) {
            this.darkTheme = params.darkTheme;
        }
        if (params.appVersion !== undefined) {
            this.appVersion = params.appVersion;
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
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__offlineMode.purgeDependencyOnElmtId(rmElmtId);
        this.__globalProxy.purgeDependencyOnElmtId(rmElmtId);
        this.__highContrast.purgeDependencyOnElmtId(rmElmtId);
        this.__uiScale.purgeDependencyOnElmtId(rmElmtId);
        this.__screenReader.purgeDependencyOnElmtId(rmElmtId);
        this.__darkTheme.purgeDependencyOnElmtId(rmElmtId);
        this.__appVersion.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__themeRefreshKey.aboutToBeDeleted();
        this.__themeRev.aboutToBeDeleted();
        this.__offlineMode.aboutToBeDeleted();
        this.__globalProxy.aboutToBeDeleted();
        this.__highContrast.aboutToBeDeleted();
        this.__uiScale.aboutToBeDeleted();
        this.__screenReader.aboutToBeDeleted();
        this.__darkTheme.aboutToBeDeleted();
        this.__appVersion.aboutToBeDeleted();
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
    /** 与 ThemeManager 广播同步，确保设置面板自身色值随主题刷新 */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
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
    private __darkTheme: ObservedPropertySimplePU<boolean>;
    get darkTheme() {
        return this.__darkTheme.get();
    }
    set darkTheme(newValue: boolean) {
        this.__darkTheme.set(newValue);
    }
    private __appVersion: ObservedPropertySimplePU<string>;
    get appVersion() {
        return this.__appVersion.get();
    }
    set appVersion(newValue: string) {
        this.__appVersion.set(newValue);
    }
    private appService: AppService;
    aboutToAppear(): void {
        this.reloadFromService();
    }
    private reloadFromService(): void {
        this.darkTheme = ThemeManager.getInstance().isDark();
        this.offlineMode = this.appService.isOfflineMode();
        this.globalProxy = this.appService.getGlobalProxy();
        const a11y = this.appService.getAccessibility();
        this.highContrast = a11y.highContrast;
        this.uiScale = Math.round(a11y.uiScale * 100);
        this.screenReader = a11y.screenReader;
    }
    private bumpUi(): void {
        this.themeRefreshKey++;
    }
    private applyTheme(dark: boolean): void {
        this.darkTheme = dark;
        ThemeManager.getInstance().setMode(dark ? 'dark' : 'light');
        this.bumpUi();
        this.statusMessage = dark ? '已启用深色主题' : '已启用浅色主题';
        this.appService.announceIfScreenReader(this.statusMessage);
    }
    private applyAccessibility(): void {
        const cfg: AccessibilityConfig = {
            highContrast: this.highContrast,
            keyboardOnly: false,
            uiScale: this.uiScale / 100,
            screenReader: this.screenReader
        };
        this.appService.setAccessibility(cfg);
        this.bumpUi();
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height('100%');
            Scroll.scrollBar(BarState.Auto);
            Scroll.align(Alignment.TopStart);
            Scroll.backgroundColor(ProteusColors.CANVAS_BG);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 0 });
            Column.alignItems(HorizontalAlign.Start);
            Column.width('100%');
            Column.padding({ bottom: 12 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 依赖 themeRev / themeRefreshKey，确保切换主题后本面板自身也刷新色值
            Text.create(`设置 · ${this.themeRev}_${this.themeRefreshKey}`);
            // 依赖 themeRev / themeRefreshKey，确保切换主题后本面板自身也刷新色值
            Text.fontSize(1);
            // 依赖 themeRev / themeRefreshKey，确保切换主题后本面板自身也刷新色值
            Text.height(0);
            // 依赖 themeRev / themeRefreshKey，确保切换主题后本面板自身也刷新色值
            Text.opacity(0);
        }, Text);
        // 依赖 themeRev / themeRefreshKey，确保切换主题后本面板自身也刷新色值
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: '平台设置' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 73, col: 9 });
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
            Column.create();
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
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6, bottom: 6 });
            Row.alignItems(VerticalAlign.Center);
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
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSwitch(this, {
                        isOn: this.darkTheme,
                        onChange: (on: boolean) => { this.applyTheme(on); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 91, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            isOn: this.darkTheme,
                            onChange: (on: boolean) => { this.applyTheme(on); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        isOn: this.darkTheme
                    });
                }
            }, { name: "ProteusSwitch" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 8 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '浅色',
                        widthVal: '46%',
                        onAction: () => { this.applyTheme(false); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 101, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '浅色',
                            widthVal: '46%',
                            onAction: () => { this.applyTheme(false); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '浅色',
                        widthVal: '46%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '深色',
                        widthVal: '46%',
                        onAction: () => { this.applyTheme(true); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 106, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '深色',
                            widthVal: '46%',
                            onAction: () => { this.applyTheme(true); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '深色',
                        widthVal: '46%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
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
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6, bottom: 6 });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('离线模式');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.offlineMode ? '仅本地' : '可联网');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSwitch(this, {
                        isOn: this.offlineMode,
                        onChange: (on: boolean) => {
                            this.offlineMode = on;
                            this.appService.setOfflineMode(on);
                            this.statusMessage = on ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 135, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            isOn: this.offlineMode,
                            onChange: (on: boolean) => {
                                this.offlineMode = on;
                                this.appService.setOfflineMode(on);
                                this.statusMessage = on ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        isOn: this.offlineMode
                    });
                }
            }, { name: "ProteusSwitch" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: this.offlineMode ? '关闭离线' : '开启离线',
                        widthVal: '92%',
                        onAction: () => {
                            this.offlineMode = !this.offlineMode;
                            this.appService.setOfflineMode(this.offlineMode);
                            this.statusMessage = this.offlineMode ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 149, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: this.offlineMode ? '关闭离线' : '开启离线',
                            widthVal: '92%',
                            onAction: () => {
                                this.offlineMode = !this.offlineMode;
                                this.appService.setOfflineMode(this.offlineMode);
                                this.statusMessage = this.offlineMode ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: this.offlineMode ? '关闭离线' : '开启离线',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
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
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        text: this.globalProxy,
                        placeholder: '启用系统代理（如 Clash）',
                        onChange: (v: string) => { this.globalProxy = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 167, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            text: this.globalProxy,
                            placeholder: '启用系统代理（如 Clash）',
                            onChange: (v: string) => { this.globalProxy = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        text: this.globalProxy,
                        placeholder: '启用系统代理（如 Clash）'
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('填写任意非空内容并点「应用」后，AI 请求会走系统代理(usingProxy)。');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8, top: 2 });
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('鸿蒙应用默认不走 Clash/VPN：若测试报 DNS 失败，请开启此项或确保代理软件在线。清空并应用则直连。');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8, top: 2 });
            Text.width('100%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 8, right: 8, bottom: 8, top: 4 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '应用代理设置',
                        widthVal: '92%',
                        onAction: () => {
                            this.appService.setGlobalProxy(this.globalProxy);
                            this.statusMessage = this.globalProxy.trim().length > 0
                                ? `代理已启用系统代理: ${this.globalProxy.trim()}`
                                : '代理已清空（直连）';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 189, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '应用代理设置',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.setGlobalProxy(this.globalProxy);
                                this.statusMessage = this.globalProxy.trim().length > 0
                                    ? `代理已启用系统代理: ${this.globalProxy.trim()}`
                                    : '代理已清空（直连）';
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
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
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
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6, bottom: 6 });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('高对比度');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSwitch(this, {
                        isOn: this.highContrast,
                        onChange: (on: boolean) => {
                            this.highContrast = on;
                            this.applyAccessibility();
                            this.statusMessage = on ? '已开启高对比度' : '已关闭高对比度';
                            this.appService.announceIfScreenReader(this.statusMessage);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 218, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            isOn: this.highContrast,
                            onChange: (on: boolean) => {
                                this.highContrast = on;
                                this.applyAccessibility();
                                this.statusMessage = on ? '已开启高对比度' : '已关闭高对比度';
                                this.appService.announceIfScreenReader(this.statusMessage);
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        isOn: this.highContrast
                    });
                }
            }, { name: "ProteusSwitch" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`UI 缩放: ${this.uiScale}%`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.padding({ left: 8 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Slider.create({ value: this.uiScale, min: 100, max: 150, step: 25 });
            Slider.width('92%');
            Slider.margin({ left: 8, right: 8 });
            Slider.onChange((v: number) => {
                this.uiScale = Math.round(v);
                this.applyAccessibility();
                this.statusMessage = `UI 缩放 ${this.uiScale}%`;
            });
        }, Slider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, bottom: 4 });
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '100%',
                        widthVal: '30%',
                        onAction: () => {
                            this.uiScale = 100;
                            this.applyAccessibility();
                            this.statusMessage = 'UI 缩放 100%';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 247, col: 15 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '100%',
                            widthVal: '30%',
                            onAction: () => {
                                this.uiScale = 100;
                                this.applyAccessibility();
                                this.statusMessage = 'UI 缩放 100%';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '100%',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '125%',
                        widthVal: '30%',
                        onAction: () => {
                            this.uiScale = 125;
                            this.applyAccessibility();
                            this.statusMessage = 'UI 缩放 125%';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 256, col: 15 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '125%',
                            widthVal: '30%',
                            onAction: () => {
                                this.uiScale = 125;
                                this.applyAccessibility();
                                this.statusMessage = 'UI 缩放 125%';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '125%',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '150%',
                        widthVal: '30%',
                        onAction: () => {
                            this.uiScale = 150;
                            this.applyAccessibility();
                            this.statusMessage = 'UI 缩放 150%';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 265, col: 15 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '150%',
                            widthVal: '30%',
                            onAction: () => {
                                this.uiScale = 150;
                                this.applyAccessibility();
                                this.statusMessage = 'UI 缩放 150%';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '150%',
                        widthVal: '30%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 8 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6, bottom: 8 });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('语音朗读提示');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSwitch(this, {
                        isOn: this.screenReader,
                        onChange: (on: boolean) => {
                            this.screenReader = on;
                            this.applyAccessibility();
                            this.statusMessage = on ? '已开启语音朗读提示（状态栏播报）' : '已关闭语音朗读提示';
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 285, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            isOn: this.screenReader,
                            onChange: (on: boolean) => {
                                this.screenReader = on;
                                this.applyAccessibility();
                                this.statusMessage = on ? '已开启语音朗读提示（状态栏播报）' : '已关闭语音朗读提示';
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        isOn: this.screenReader
                    });
                }
            }, { name: "ProteusSwitch" });
        }
        Row.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
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
            Text.create(`软件版本 ${this.appVersion}`);
            Text.fontSize(ProteusFonts.PARAM_VALUE);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, bottom: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 8 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 4, bottom: 16 });
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
                            this.appService.announceIfScreenReader(this.statusMessage);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 317, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '保存快照',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.saveSnapshot('手动快照', '用户手动保存');
                                this.statusMessage = '版本快照已保存';
                                this.appService.announceIfScreenReader(this.statusMessage);
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
                            this.appService.announceIfScreenReader(this.statusMessage);
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 326, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '隐私清理',
                            widthVal: '92%',
                            onAction: () => {
                                this.appService.privacyCleanup();
                                this.statusMessage = '已清理 AI 缓存与临时文件';
                                this.appService.announceIfScreenReader(this.statusMessage);
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
                            void this.appService.acceptPrivacyPolicy().then(() => {
                                this.statusMessage = '已记录隐私政策同意';
                                this.appService.announceIfScreenReader(this.statusMessage);
                            });
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/PlatformSettingsPanel.ets", line: 335, col: 13 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '同意隐私政策',
                            widthVal: '92%',
                            onAction: () => {
                                void this.appService.acceptPrivacyPolicy().then(() => {
                                    this.statusMessage = '已记录隐私政策同意';
                                    this.appService.announceIfScreenReader(this.statusMessage);
                                });
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
        Column.pop();
        Column.pop();
        Scroll.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
