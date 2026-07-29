if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface ProteusHomeBottomStrip_Params {
    statusLine?: string;
}
interface ProteusHomeTextDialog_Params {
    themeRev?: number;
    title?: string;
    body?: string;
    onClose?: () => void;
}
interface ProteusHomeHelpDialog_Params {
    themeRev?: number;
    title?: string;
    body?: string;
    primaryLabel?: string;
    onPrimary?: () => void;
    onClose?: () => void;
}
interface ProteusHomeWizardDialog_Params {
    themeRev?: number;
    step?: number;
    projectName?: string;
    projectDir?: string;
    onNameChange?: (v: string) => void;
    onCancel?: () => void;
    onBack?: () => void;
    onNext?: () => void;
    onFinish?: () => void;
}
interface ProteusHomeNewsCard_Params {
    themeRev?: number;
    description?: string;
    releaseDate?: string;
    actionLabel?: string;
    isCurrent?: boolean;
    showButton?: boolean;
    onAction?: () => void;
}
interface ProteusHomeNewsRow_Params {
    themeRev?: number;
    description?: string;
    releaseDate?: string;
    uscValid?: string;
    actionLabel?: string;
    showButton?: boolean;
    isCurrent?: boolean;
    onAction?: () => void;
}
interface ProteusHomeAboutRow_Params {
    label?: string;
    value?: string;
    warn?: boolean;
}
interface ProteusHomeDownloadBtn_Params {
    themeRev?: number;
    label?: string;
    primary?: boolean;
    btnEnabled?: boolean;
    onAction?: () => void;
    pressed?: boolean;
}
interface ProteusHomeRecentRow_Params {
    themeRev?: number;
    name?: string;
    selected?: boolean;
    warn?: boolean;
    onSelect?: () => void;
    onOpen?: () => void;
}
interface ProteusHomeInlineLink_Params {
    themeRev?: number;
    label?: string;
    tabEnabled?: boolean;
    onAction?: () => void;
    pressed?: boolean;
}
interface ProteusHomeIconLink_Params {
    themeRev?: number;
    label?: string;
    iconTag?: string;
    tabEnabled?: boolean;
    onAction?: () => void;
    pressed?: boolean;
}
interface ProteusHomeTopBar_Params {
    themeRev?: number;
    titleLine?: string;
    versionLabel?: string;
}
interface ProteusHomePanel_Params {
    themeRev?: number;
    title?: string;
    subtitle?: string;
    panelWeight?: number;
    highlighted?: boolean;
    body?: () => void;
}
interface ProteusHomeSectionDivider_Params {
}
interface ProteusHomeSectionTitle_Params {
    title?: string;
}
interface ProteusHomeBackdrop_Params {
    content?: () => void;
}
import { ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusClassicBtn, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
/** 工业风色板 */
export class ProteusHomeColors {
    static readonly OUTER_BG: string = '#A8ADB4';
    static readonly WORKSPACE: string = '#B4B9C0';
    static readonly SIDEBAR_BG: string = '#C8CDD4';
    static readonly PANEL_BG: string = '#D8DCE2';
    static readonly PANEL_INSET: string = '#E4E7EC';
    static readonly PANEL_BORDER: string = '#6B7280';
    static readonly PANEL_BORDER_LIGHT: string = '#F2F4F7';
    static readonly PANEL_HEAD_BG: string = '#B0B6BE';
    static readonly PANEL_HEAD_TEXT: string = '#1A1F26';
    static readonly TOP_BAR: string = '#3A424D';
    static readonly TOP_BAR_BORDER: string = '#252B33';
    static readonly TOP_BAR_TITLE: string = '#EDEFF2';
    static readonly TOP_BAR_SUB: string = '#A8B0BA';
    static readonly ACCENT: string = '#2E5A88';
    static readonly ACCENT_SOFT: string = '#B8CCE0';
    static readonly ACCENT_HOVER: string = '#C8D6E4';
    static readonly LINK: string = '#1E4A72';
    static readonly TEXT: string = '#1F2937';
    static readonly TEXT_DIM: string = '#5C6570';
    static readonly RED: string = '#B83232';
    static readonly ROW_SEL: string = '#9BB4CE';
    static readonly ROW_SEL_TEXT: string = '#0F1720';
    static readonly BTN_FACE: string = '#C4C9D0';
    static readonly BTN_FACE_PRESSED: string = '#A8AEB6';
    static readonly BTN_PRIMARY: string = '#4A6FA5';
    static readonly BTN_PRIMARY_PRESSED: string = '#3D5E8F';
    static readonly BTN_PRIMARY_TEXT: string = '#FFFFFF';
    static readonly ROW_BORDER: string = '#9CA3AF';
    static readonly TABLE_HEAD_BG: string = '#B8BEC6';
    static readonly STATUS_BAR: string = '#3A424D';
    static readonly STATUS_TEXT: string = '#C8CDD4';
    static readonly STATUS_BORDER: string = '#252B33';
    static readonly HIGHLIGHT: string = '#4A6FA5';
    static readonly LISTBOX_BORDER: string = '#6B7280';
    static readonly DISABLED: string = '#8B939E';
}
export interface ProteusHomeNewsItem {
    description: string;
    releaseDate: string;
    uscValid: string;
    actionLabel: string;
}
export interface ProteusHomeLinkItem {
    label: string;
    tabEnabled: boolean;
}
export class ProteusHomeBackdrop extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.content = undefined;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeBackdrop_Params) {
        if (params.content !== undefined) {
            this.content = params.content;
        }
    }
    updateStateVars(params: ProteusHomeBackdrop_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
    }
    aboutToBeDeleted() {
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __content;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusHomeColors.OUTER_BG);
        }, Column);
        this.content.bind(this)();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeSectionTitle extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__title = new SynchedPropertySimpleOneWayPU(params.title, this, "title");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeSectionTitle_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
    }
    updateStateVars(params: ProteusHomeSectionTitle_Params) {
        this.__title.reset(params.title);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__title.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__title.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __title: SynchedPropertySimpleOneWayPU<string>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: string) {
        this.__title.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.backgroundColor(ProteusHomeColors.PANEL_HEAD_BG);
            Row.border({
                width: { bottom: 1, top: 1 },
                color: ProteusHomeColors.PANEL_BORDER
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(11);
            Text.fontColor(ProteusHomeColors.PANEL_HEAD_TEXT);
            Text.fontWeight(FontWeight.Bold);
            Text.padding({ left: 8, top: 5, bottom: 4 });
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeSectionDivider extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeSectionDivider_Params) {
    }
    updateStateVars(params: ProteusHomeSectionDivider_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
    }
    aboutToBeDeleted() {
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height(1);
            Column.backgroundColor(ProteusHomeColors.PANEL_BORDER);
            Column.margin({ top: 2, bottom: 2 });
        }, Column);
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomePanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertySimpleOneWayPU(params.title, this, "title");
        this.__subtitle = new SynchedPropertySimpleOneWayPU(params.subtitle, this, "subtitle");
        this.__panelWeight = new SynchedPropertySimpleOneWayPU(params.panelWeight, this, "panelWeight");
        this.__highlighted = new SynchedPropertySimpleOneWayPU(params.highlighted, this, "highlighted");
        this.body = undefined;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomePanel_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
        if (params.subtitle === undefined) {
            this.__subtitle.set('');
        }
        if (params.panelWeight === undefined) {
            this.__panelWeight.set(1);
        }
        if (params.highlighted === undefined) {
            this.__highlighted.set(false);
        }
        if (params.body !== undefined) {
            this.body = params.body;
        }
    }
    updateStateVars(params: ProteusHomePanel_Params) {
        this.__title.reset(params.title);
        this.__subtitle.reset(params.subtitle);
        this.__panelWeight.reset(params.panelWeight);
        this.__highlighted.reset(params.highlighted);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
        this.__subtitle.purgeDependencyOnElmtId(rmElmtId);
        this.__panelWeight.purgeDependencyOnElmtId(rmElmtId);
        this.__highlighted.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        this.__subtitle.aboutToBeDeleted();
        this.__panelWeight.aboutToBeDeleted();
        this.__highlighted.aboutToBeDeleted();
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
    private __title: SynchedPropertySimpleOneWayPU<string>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: string) {
        this.__title.set(newValue);
    }
    private __subtitle: SynchedPropertySimpleOneWayPU<string>;
    get subtitle() {
        return this.__subtitle.get();
    }
    set subtitle(newValue: string) {
        this.__subtitle.set(newValue);
    }
    private __panelWeight: SynchedPropertySimpleOneWayPU<number>;
    get panelWeight() {
        return this.__panelWeight.get();
    }
    set panelWeight(newValue: number) {
        this.__panelWeight.set(newValue);
    }
    private __highlighted: SynchedPropertySimpleOneWayPU<boolean>;
    get highlighted() {
        return this.__highlighted.get();
    }
    set highlighted(newValue: boolean) {
        this.__highlighted.set(newValue);
    }
    private __body;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.layoutWeight(this.panelWeight);
            Column.backgroundColor(ProteusHomeColors.PANEL_BG);
            Column.border({
                width: this.highlighted ? 2 : 1,
                color: this.highlighted ? ProteusHomeColors.HIGHLIGHT : ProteusHomeColors.PANEL_BORDER
            });
            Column.clip(true);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.backgroundColor(ProteusHomeColors.PANEL_HEAD_BG);
            Row.border({
                width: { bottom: 1 },
                color: ProteusHomeColors.PANEL_BORDER
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(11);
            Text.fontColor(ProteusHomeColors.PANEL_HEAD_TEXT);
            Text.fontWeight(FontWeight.Bold);
            Text.padding({ left: 8, top: 4, bottom: 4 });
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.layoutWeight(1);
            Column.alignItems(HorizontalAlign.Start);
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Column);
        this.body.bind(this)();
        Column.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeTopBar extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__titleLine = new SynchedPropertySimpleOneWayPU(params.titleLine, this, "titleLine");
        this.__versionLabel = new SynchedPropertySimpleOneWayPU(params.versionLabel, this, "versionLabel");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeTopBar_Params) {
        if (params.titleLine === undefined) {
            this.__titleLine.set('Design Suite');
        }
        if (params.versionLabel === undefined) {
            this.__versionLabel.set('');
        }
    }
    updateStateVars(params: ProteusHomeTopBar_Params) {
        this.__titleLine.reset(params.titleLine);
        this.__versionLabel.reset(params.versionLabel);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__titleLine.purgeDependencyOnElmtId(rmElmtId);
        this.__versionLabel.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__titleLine.aboutToBeDeleted();
        this.__versionLabel.aboutToBeDeleted();
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
    private __titleLine: SynchedPropertySimpleOneWayPU<string>;
    get titleLine() {
        return this.__titleLine.get();
    }
    set titleLine(newValue: string) {
        this.__titleLine.set(newValue);
    }
    private __versionLabel: SynchedPropertySimpleOneWayPU<string>;
    get versionLabel() {
        return this.__versionLabel.get();
    }
    set versionLabel(newValue: string) {
        this.__versionLabel.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(40);
            Row.padding({ left: 12, right: 12 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(ProteusHomeColors.TOP_BAR);
            Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.TOP_BAR_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Image.create({ "id": 83886176, "type": 20000, params: [], "bundleName": "com.elecdraw.aischsim", "moduleName": "entry" });
            Image.width(24);
            Image.height(24);
            Image.objectFit(ImageFit.Contain);
            Image.margin({ right: 10 });
        }, Image);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('ElecDraw');
            Text.fontSize(13);
            Text.fontColor(ProteusHomeColors.TOP_BAR_TITLE);
            Text.fontWeight(FontWeight.Bold);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.subtitleLine());
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.TOP_BAR_SUB);
            Text.margin({ top: 1 });
        }, Text);
        Text.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.versionLabel.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.versionLabel);
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.TOP_BAR_SUB);
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
    }
    private subtitleLine(): string {
        if (this.titleLine.length > 0) {
            return this.titleLine;
        }
        return 'Design Suite';
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeIconLink extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__iconTag = new SynchedPropertySimpleOneWayPU(params.iconTag, this, "iconTag");
        this.__tabEnabled = new SynchedPropertySimpleOneWayPU(params.tabEnabled, this, "tabEnabled");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeIconLink_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.iconTag === undefined) {
            this.__iconTag.set('');
        }
        if (params.tabEnabled === undefined) {
            this.__tabEnabled.set(true);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusHomeIconLink_Params) {
        this.__label.reset(params.label);
        this.__iconTag.reset(params.iconTag);
        this.__tabEnabled.reset(params.tabEnabled);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__iconTag.purgeDependencyOnElmtId(rmElmtId);
        this.__tabEnabled.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__iconTag.aboutToBeDeleted();
        this.__tabEnabled.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
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
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: string) {
        this.__label.set(newValue);
    }
    private __iconTag: SynchedPropertySimpleOneWayPU<string>;
    get iconTag() {
        return this.__iconTag.get();
    }
    set iconTag(newValue: string) {
        this.__iconTag.set(newValue);
    }
    private __tabEnabled: SynchedPropertySimpleOneWayPU<boolean>;
    get tabEnabled() {
        return this.__tabEnabled.get();
    }
    set tabEnabled(newValue: boolean) {
        this.__tabEnabled.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 10, right: 8, top: 3, bottom: 3 });
            Row.backgroundColor(this.pressed && this.tabEnabled ? ProteusHomeColors.ACCENT_HOVER : '#00000000');
            Row.onClick(() => {
                this.onAction();
            });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(11);
            Text.fontColor(this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED);
            Text.decoration({
                type: this.tabEnabled ? TextDecorationType.Underline : TextDecorationType.None,
                color: this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED
            });
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (!this.tabEnabled) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('N/A');
                        Text.fontSize(8);
                        Text.fontColor(ProteusHomeColors.DISABLED);
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
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeInlineLink extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__tabEnabled = new SynchedPropertySimpleOneWayPU(params.tabEnabled, this, "tabEnabled");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeInlineLink_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.tabEnabled === undefined) {
            this.__tabEnabled.set(true);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusHomeInlineLink_Params) {
        this.__label.reset(params.label);
        this.__tabEnabled.reset(params.tabEnabled);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__tabEnabled.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__tabEnabled.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
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
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: string) {
        this.__label.set(newValue);
    }
    private __tabEnabled: SynchedPropertySimpleOneWayPU<boolean>;
    get tabEnabled() {
        return this.__tabEnabled.get();
    }
    set tabEnabled(newValue: boolean) {
        this.__tabEnabled.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(11);
            Text.fontColor(this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED);
            Text.decoration({
                type: this.tabEnabled ? TextDecorationType.Underline : TextDecorationType.None,
                color: this.tabEnabled ? ProteusHomeColors.LINK : ProteusHomeColors.DISABLED
            });
            Text.padding({ left: 2, right: 2, top: 2, bottom: 2 });
            Text.backgroundColor(this.pressed && this.tabEnabled ? ProteusHomeColors.ACCENT_HOVER : '#00000000');
            Text.onClick(() => {
                if (this.tabEnabled) {
                    this.onAction();
                }
            });
            Text.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Text);
        Text.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeRecentRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__name = new SynchedPropertySimpleOneWayPU(params.name, this, "name");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.__warn = new SynchedPropertySimpleOneWayPU(params.warn, this, "warn");
        this.onSelect = () => { };
        this.onOpen = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeRecentRow_Params) {
        if (params.name === undefined) {
            this.__name.set('');
        }
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.warn === undefined) {
            this.__warn.set(false);
        }
        if (params.onSelect !== undefined) {
            this.onSelect = params.onSelect;
        }
        if (params.onOpen !== undefined) {
            this.onOpen = params.onOpen;
        }
    }
    updateStateVars(params: ProteusHomeRecentRow_Params) {
        this.__name.reset(params.name);
        this.__selected.reset(params.selected);
        this.__warn.reset(params.warn);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__name.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__warn.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__name.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__warn.aboutToBeDeleted();
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
    private __name: SynchedPropertySimpleOneWayPU<string>;
    get name() {
        return this.__name.get();
    }
    set name(newValue: string) {
        this.__name.set(newValue);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private __warn: SynchedPropertySimpleOneWayPU<boolean>;
    get warn() {
        return this.__warn.get();
    }
    set warn(newValue: boolean) {
        this.__warn.set(newValue);
    }
    private onSelect: () => void;
    private onOpen: () => void;
    private fg(): string {
        if (this.warn) {
            return ProteusHomeColors.RED;
        }
        if (this.selected) {
            return ProteusHomeColors.ROW_SEL_TEXT;
        }
        return ProteusHomeColors.TEXT;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.name);
            Text.fontSize(11);
            Text.fontColor(this.fg());
            Text.width('100%');
            Text.padding({ left: 6, right: 6, top: 3, bottom: 3 });
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.backgroundColor(this.selected ? ProteusHomeColors.ROW_SEL : '#00000000');
            Text.onClick(() => this.onSelect());
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => this.onOpen());
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Text);
        Text.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeDownloadBtn extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__primary = new SynchedPropertySimpleOneWayPU(params.primary, this, "primary");
        this.__btnEnabled = new SynchedPropertySimpleOneWayPU(params.btnEnabled, this, "btnEnabled");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeDownloadBtn_Params) {
        if (params.label === undefined) {
            this.__label.set('Open');
        }
        if (params.primary === undefined) {
            this.__primary.set(true);
        }
        if (params.btnEnabled === undefined) {
            this.__btnEnabled.set(true);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusHomeDownloadBtn_Params) {
        this.__label.reset(params.label);
        this.__primary.reset(params.primary);
        this.__btnEnabled.reset(params.btnEnabled);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__primary.purgeDependencyOnElmtId(rmElmtId);
        this.__btnEnabled.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__primary.aboutToBeDeleted();
        this.__btnEnabled.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
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
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: string) {
        this.__label.set(newValue);
    }
    private __primary: SynchedPropertySimpleOneWayPU<boolean>;
    get primary() {
        return this.__primary.get();
    }
    set primary(newValue: boolean) {
        this.__primary.set(newValue);
    }
    private __btnEnabled: SynchedPropertySimpleOneWayPU<boolean>;
    get btnEnabled() {
        return this.__btnEnabled.get();
    }
    set btnEnabled(newValue: boolean) {
        this.__btnEnabled.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private bg(): string {
        if (!this.btnEnabled) {
            return ProteusHomeColors.BTN_FACE;
        }
        if (this.primary) {
            return this.pressed ? ProteusHomeColors.BTN_PRIMARY_PRESSED : ProteusHomeColors.BTN_PRIMARY;
        }
        return this.pressed ? ProteusHomeColors.BTN_FACE_PRESSED : ProteusHomeColors.BTN_FACE;
    }
    private fg(): string {
        if (!this.btnEnabled) {
            return ProteusHomeColors.DISABLED;
        }
        return this.primary ? ProteusHomeColors.BTN_PRIMARY_TEXT : ProteusHomeColors.TEXT;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(10);
            Text.fontColor(this.fg());
            Text.fontWeight(FontWeight.Medium);
            Text.textAlign(TextAlign.Center);
            Text.padding({ left: 14, right: 14 });
            Text.height(24);
            Text.backgroundColor(this.bg());
            Text.border({
                width: 1,
                color: this.primary ? ProteusHomeColors.BTN_PRIMARY_PRESSED : ProteusHomeColors.PANEL_BORDER
            });
            Text.opacity(this.btnEnabled ? 1 : 0.6);
            Text.onClick(() => {
                if (this.btnEnabled) {
                    this.onAction();
                }
            });
            Text.onTouch((event: TouchEvent) => {
                if (!this.btnEnabled) {
                    return;
                }
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Text);
        Text.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeAboutRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__value = new SynchedPropertySimpleOneWayPU(params.value, this, "value");
        this.__warn = new SynchedPropertySimpleOneWayPU(params.warn, this, "warn");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeAboutRow_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.value === undefined) {
            this.__value.set('');
        }
        if (params.warn === undefined) {
            this.__warn.set(false);
        }
    }
    updateStateVars(params: ProteusHomeAboutRow_Params) {
        this.__label.reset(params.label);
        this.__value.reset(params.value);
        this.__warn.reset(params.warn);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__value.purgeDependencyOnElmtId(rmElmtId);
        this.__warn.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__value.aboutToBeDeleted();
        this.__warn.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: string) {
        this.__label.set(newValue);
    }
    private __value: SynchedPropertySimpleOneWayPU<string>;
    get value() {
        return this.__value.get();
    }
    set value(newValue: string) {
        this.__value.set(newValue);
    }
    private __warn: SynchedPropertySimpleOneWayPU<boolean>;
    get warn() {
        return this.__warn.get();
    }
    set warn(newValue: boolean) {
        this.__warn.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 2, bottom: 2 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width('46%');
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.value);
            Text.fontSize(9);
            Text.fontColor(this.warn ? ProteusHomeColors.RED : ProteusHomeColors.TEXT);
            Text.layoutWeight(1);
            Text.textAlign(TextAlign.End);
            Text.maxLines(2);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeNewsRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__description = new SynchedPropertySimpleOneWayPU(params.description, this, "description");
        this.__releaseDate = new SynchedPropertySimpleOneWayPU(params.releaseDate, this, "releaseDate");
        this.__uscValid = new SynchedPropertySimpleOneWayPU(params.uscValid, this, "uscValid");
        this.__actionLabel = new SynchedPropertySimpleOneWayPU(params.actionLabel, this, "actionLabel");
        this.__showButton = new SynchedPropertySimpleOneWayPU(params.showButton, this, "showButton");
        this.__isCurrent = new SynchedPropertySimpleOneWayPU(params.isCurrent, this, "isCurrent");
        this.onAction = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeNewsRow_Params) {
        if (params.description === undefined) {
            this.__description.set('');
        }
        if (params.releaseDate === undefined) {
            this.__releaseDate.set('');
        }
        if (params.uscValid === undefined) {
            this.__uscValid.set('');
        }
        if (params.actionLabel === undefined) {
            this.__actionLabel.set('Download');
        }
        if (params.showButton === undefined) {
            this.__showButton.set(true);
        }
        if (params.isCurrent === undefined) {
            this.__isCurrent.set(false);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
    }
    updateStateVars(params: ProteusHomeNewsRow_Params) {
        this.__description.reset(params.description);
        this.__releaseDate.reset(params.releaseDate);
        this.__uscValid.reset(params.uscValid);
        this.__actionLabel.reset(params.actionLabel);
        this.__showButton.reset(params.showButton);
        this.__isCurrent.reset(params.isCurrent);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__description.purgeDependencyOnElmtId(rmElmtId);
        this.__releaseDate.purgeDependencyOnElmtId(rmElmtId);
        this.__uscValid.purgeDependencyOnElmtId(rmElmtId);
        this.__actionLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__showButton.purgeDependencyOnElmtId(rmElmtId);
        this.__isCurrent.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__description.aboutToBeDeleted();
        this.__releaseDate.aboutToBeDeleted();
        this.__uscValid.aboutToBeDeleted();
        this.__actionLabel.aboutToBeDeleted();
        this.__showButton.aboutToBeDeleted();
        this.__isCurrent.aboutToBeDeleted();
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
    private __description: SynchedPropertySimpleOneWayPU<string>;
    get description() {
        return this.__description.get();
    }
    set description(newValue: string) {
        this.__description.set(newValue);
    }
    private __releaseDate: SynchedPropertySimpleOneWayPU<string>;
    get releaseDate() {
        return this.__releaseDate.get();
    }
    set releaseDate(newValue: string) {
        this.__releaseDate.set(newValue);
    }
    private __uscValid: SynchedPropertySimpleOneWayPU<string>;
    get uscValid() {
        return this.__uscValid.get();
    }
    set uscValid(newValue: string) {
        this.__uscValid.set(newValue);
    }
    private __actionLabel: SynchedPropertySimpleOneWayPU<string>;
    get actionLabel() {
        return this.__actionLabel.get();
    }
    set actionLabel(newValue: string) {
        this.__actionLabel.set(newValue);
    }
    private __showButton: SynchedPropertySimpleOneWayPU<boolean>;
    get showButton() {
        return this.__showButton.get();
    }
    set showButton(newValue: boolean) {
        this.__showButton.set(newValue);
    }
    private __isCurrent: SynchedPropertySimpleOneWayPU<boolean>;
    get isCurrent() {
        return this.__isCurrent.get();
    }
    set isCurrent(newValue: boolean) {
        this.__isCurrent.set(newValue);
    }
    private onAction: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(26);
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.isCurrent ? ProteusHomeColors.ACCENT_SOFT : '#00000000');
            Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.ROW_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.description);
            Text.fontSize(10);
            Text.fontColor(this.isCurrent ? ProteusHomeColors.TEXT : ProteusHomeColors.LINK);
            Text.fontWeight(this.isCurrent ? FontWeight.Medium : FontWeight.Normal);
            Text.decoration({
                type: this.isCurrent ? TextDecorationType.None : TextDecorationType.Underline,
                color: ProteusHomeColors.LINK
            });
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.padding({ left: 6 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.releaseDate);
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width(68);
            Text.textAlign(TextAlign.Center);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.uscValid);
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width(36);
            Text.textAlign(TextAlign.Center);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showButton) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.margin({ right: 4 });
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, {
                                    label: this.actionLabel,
                                    primary: false,
                                    onAction: () => this.onAction()
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 433, col: 9 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.actionLabel,
                                        primary: false,
                                        onAction: () => this.onAction()
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: this.actionLabel,
                                    primary: false
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.actionLabel);
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.ACCENT);
                        Text.fontWeight(FontWeight.Medium);
                        Text.width(64);
                        Text.textAlign(TextAlign.Center);
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeNewsCard extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__description = new SynchedPropertySimpleOneWayPU(params.description, this, "description");
        this.__releaseDate = new SynchedPropertySimpleOneWayPU(params.releaseDate, this, "releaseDate");
        this.__actionLabel = new SynchedPropertySimpleOneWayPU(params.actionLabel, this, "actionLabel");
        this.__isCurrent = new SynchedPropertySimpleOneWayPU(params.isCurrent, this, "isCurrent");
        this.__showButton = new SynchedPropertySimpleOneWayPU(params.showButton, this, "showButton");
        this.onAction = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeNewsCard_Params) {
        if (params.description === undefined) {
            this.__description.set('');
        }
        if (params.releaseDate === undefined) {
            this.__releaseDate.set('');
        }
        if (params.actionLabel === undefined) {
            this.__actionLabel.set('Download');
        }
        if (params.isCurrent === undefined) {
            this.__isCurrent.set(false);
        }
        if (params.showButton === undefined) {
            this.__showButton.set(true);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
    }
    updateStateVars(params: ProteusHomeNewsCard_Params) {
        this.__description.reset(params.description);
        this.__releaseDate.reset(params.releaseDate);
        this.__actionLabel.reset(params.actionLabel);
        this.__isCurrent.reset(params.isCurrent);
        this.__showButton.reset(params.showButton);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__description.purgeDependencyOnElmtId(rmElmtId);
        this.__releaseDate.purgeDependencyOnElmtId(rmElmtId);
        this.__actionLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__isCurrent.purgeDependencyOnElmtId(rmElmtId);
        this.__showButton.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__description.aboutToBeDeleted();
        this.__releaseDate.aboutToBeDeleted();
        this.__actionLabel.aboutToBeDeleted();
        this.__isCurrent.aboutToBeDeleted();
        this.__showButton.aboutToBeDeleted();
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
    private __description: SynchedPropertySimpleOneWayPU<string>;
    get description() {
        return this.__description.get();
    }
    set description(newValue: string) {
        this.__description.set(newValue);
    }
    private __releaseDate: SynchedPropertySimpleOneWayPU<string>;
    get releaseDate() {
        return this.__releaseDate.get();
    }
    set releaseDate(newValue: string) {
        this.__releaseDate.set(newValue);
    }
    private __actionLabel: SynchedPropertySimpleOneWayPU<string>;
    get actionLabel() {
        return this.__actionLabel.get();
    }
    set actionLabel(newValue: string) {
        this.__actionLabel.set(newValue);
    }
    private __isCurrent: SynchedPropertySimpleOneWayPU<boolean>;
    get isCurrent() {
        return this.__isCurrent.get();
    }
    set isCurrent(newValue: boolean) {
        this.__isCurrent.set(newValue);
    }
    private __showButton: SynchedPropertySimpleOneWayPU<boolean>;
    get showButton() {
        return this.__showButton.get();
    }
    set showButton(newValue: boolean) {
        this.__showButton.set(newValue);
    }
    private onAction: () => void;
    initialRender() {
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeNewsRow(this, {
                        description: this.description,
                        releaseDate: this.releaseDate,
                        uscValid: this.isCurrent ? 'Yes' : '—',
                        actionLabel: this.actionLabel,
                        showButton: this.showButton,
                        isCurrent: this.isCurrent,
                        onAction: () => this.onAction()
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 468, col: 5 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            description: this.description,
                            releaseDate: this.releaseDate,
                            uscValid: this.isCurrent ? 'Yes' : '—',
                            actionLabel: this.actionLabel,
                            showButton: this.showButton,
                            isCurrent: this.isCurrent,
                            onAction: () => this.onAction()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        description: this.description,
                        releaseDate: this.releaseDate,
                        uscValid: this.isCurrent ? 'Yes' : '—',
                        actionLabel: this.actionLabel,
                        showButton: this.showButton,
                        isCurrent: this.isCurrent
                    });
                }
            }, { name: "ProteusHomeNewsRow" });
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeWizardDialog extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__step = new SynchedPropertySimpleOneWayPU(params.step, this, "step");
        this.__projectName = new SynchedPropertySimpleOneWayPU(params.projectName, this, "projectName");
        this.__projectDir = new SynchedPropertySimpleOneWayPU(params.projectDir, this, "projectDir");
        this.onNameChange = () => { };
        this.onCancel = () => { };
        this.onBack = () => { };
        this.onNext = () => { };
        this.onFinish = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeWizardDialog_Params) {
        if (params.step === undefined) {
            this.__step.set(0);
        }
        if (params.projectName === undefined) {
            this.__projectName.set('');
        }
        if (params.projectDir === undefined) {
            this.__projectDir.set('');
        }
        if (params.onNameChange !== undefined) {
            this.onNameChange = params.onNameChange;
        }
        if (params.onCancel !== undefined) {
            this.onCancel = params.onCancel;
        }
        if (params.onBack !== undefined) {
            this.onBack = params.onBack;
        }
        if (params.onNext !== undefined) {
            this.onNext = params.onNext;
        }
        if (params.onFinish !== undefined) {
            this.onFinish = params.onFinish;
        }
    }
    updateStateVars(params: ProteusHomeWizardDialog_Params) {
        this.__step.reset(params.step);
        this.__projectName.reset(params.projectName);
        this.__projectDir.reset(params.projectDir);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__step.purgeDependencyOnElmtId(rmElmtId);
        this.__projectName.purgeDependencyOnElmtId(rmElmtId);
        this.__projectDir.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__step.aboutToBeDeleted();
        this.__projectName.aboutToBeDeleted();
        this.__projectDir.aboutToBeDeleted();
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
    private __step: SynchedPropertySimpleOneWayPU<number>;
    get step() {
        return this.__step.get();
    }
    set step(newValue: number) {
        this.__step.set(newValue);
    }
    private __projectName: SynchedPropertySimpleOneWayPU<string>;
    get projectName() {
        return this.__projectName.get();
    }
    set projectName(newValue: string) {
        this.__projectName.set(newValue);
    }
    private __projectDir: SynchedPropertySimpleOneWayPU<string>;
    get projectDir() {
        return this.__projectDir.get();
    }
    set projectDir(newValue: string) {
        this.__projectDir.set(newValue);
    }
    private onNameChange: (v: string) => void;
    private onCancel: () => void;
    private onBack: () => void;
    private onNext: () => void;
    private onFinish: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#00000055');
            Column.onClick(() => this.onCancel());
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(380);
            Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
            Column.clip(true);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(32);
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(ProteusHomeColors.PANEL_HEAD_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('New Project');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusHomeColors.PANEL_HEAD_TEXT);
            Text.fontWeight(FontWeight.Bold);
            Text.layoutWeight(1);
            Text.padding({ left: 10 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('×');
            Text.fontSize(16);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width(28);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => this.onCancel());
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding(12);
            Column.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.step === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('Project name');
                        Text.fontSize(11);
                        Text.fontColor(ProteusHomeColors.TEXT);
                        Text.width('100%');
                        Text.margin({ bottom: 4 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('Save via File → Save in the editor. No file is created here.');
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                        Text.margin({ bottom: 6 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.projectDir);
                        Text.fontSize(9);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                        Text.maxLines(2);
                        Text.margin({ bottom: 8 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        __Common__.create();
                        __Common__.width('100%');
                    }, __Common__);
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusTextInput(this, {
                                    text: this.projectName,
                                    placeholder: 'MyProject',
                                    onChange: (v: string) => this.onNameChange(v),
                                    onSubmit: () => this.onNext()
                                }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 540, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        text: this.projectName,
                                        placeholder: 'MyProject',
                                        onChange: (v: string) => this.onNameChange(v),
                                        onSubmit: () => this.onNext()
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    text: this.projectName,
                                    placeholder: 'MyProject'
                                });
                            }
                        }, { name: "ProteusTextInput" });
                    }
                    __Common__.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`Name: ${this.projectName.length > 0 ? this.projectName : 'Untitled'}`);
                        Text.fontSize(11);
                        Text.fontColor(ProteusHomeColors.TEXT);
                        Text.width('100%');
                        Text.margin({ bottom: 4 });
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('Modules: Schematic · Simulation');
                        Text.fontSize(10);
                        Text.fontColor(ProteusHomeColors.TEXT_DIM);
                        Text.width('100%');
                    }, Text);
                    Text.pop();
                });
            }
        }, If);
        If.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 12, right: 12, top: 6, bottom: 12 });
            Row.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.step > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, { label: 'Back', widthVal: 68, onAction: () => this.onBack() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 566, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: 'Back',
                                        widthVal: 68,
                                        onAction: () => this.onBack()
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: 'Back', widthVal: 68
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: 'Cancel', widthVal: 68, onAction: () => this.onCancel() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 568, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Cancel',
                            widthVal: 68,
                            onAction: () => this.onCancel()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Cancel', widthVal: 68
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.step === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, { label: 'Next', widthVal: 68, onAction: () => this.onNext() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 570, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: 'Next',
                                        widthVal: 68,
                                        onAction: () => this.onNext()
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: 'Next', widthVal: 68
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusClassicBtn(this, { label: 'Open', widthVal: 68, onAction: () => this.onFinish() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 572, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: 'Open',
                                        widthVal: 68,
                                        onAction: () => this.onFinish()
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: 'Open', widthVal: 68
                                });
                            }
                        }, { name: "ProteusClassicBtn" });
                    }
                });
            }
        }, If);
        If.pop();
        Row.pop();
        Column.pop();
        Stack.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeHelpDialog extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertySimpleOneWayPU(params.title, this, "title");
        this.__body = new SynchedPropertySimpleOneWayPU(params.body, this, "body");
        this.__primaryLabel = new SynchedPropertySimpleOneWayPU(params.primaryLabel, this, "primaryLabel");
        this.onPrimary = () => { };
        this.onClose = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeHelpDialog_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
        if (params.body === undefined) {
            this.__body.set('');
        }
        if (params.primaryLabel === undefined) {
            this.__primaryLabel.set('');
        }
        if (params.onPrimary !== undefined) {
            this.onPrimary = params.onPrimary;
        }
        if (params.onClose !== undefined) {
            this.onClose = params.onClose;
        }
    }
    updateStateVars(params: ProteusHomeHelpDialog_Params) {
        this.__title.reset(params.title);
        this.__body.reset(params.body);
        this.__primaryLabel.reset(params.primaryLabel);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
        this.__body.purgeDependencyOnElmtId(rmElmtId);
        this.__primaryLabel.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        this.__body.aboutToBeDeleted();
        this.__primaryLabel.aboutToBeDeleted();
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
    private __title: SynchedPropertySimpleOneWayPU<string>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: string) {
        this.__title.set(newValue);
    }
    private __body: SynchedPropertySimpleOneWayPU<string>;
    get body() {
        return this.__body.get();
    }
    set body(newValue: string) {
        this.__body.set(newValue);
    }
    private __primaryLabel: SynchedPropertySimpleOneWayPU<string>;
    get primaryLabel() {
        return this.__primaryLabel.get();
    }
    set primaryLabel(newValue: string) {
        this.__primaryLabel.set(newValue);
    }
    private onPrimary: () => void;
    private onClose: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#00000055');
            Column.onClick(() => this.onClose());
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(440);
            Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
            Column.clip(true);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(32);
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(ProteusHomeColors.PANEL_HEAD_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusHomeColors.PANEL_HEAD_TEXT);
            Text.fontWeight(FontWeight.Bold);
            Text.layoutWeight(1);
            Text.padding({ left: 10 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('×');
            Text.fontSize(16);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width(28);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => this.onClose());
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height(220);
            Scroll.padding(12);
            Scroll.backgroundColor(ProteusHomeColors.PANEL_INSET);
            Scroll.scrollBar(BarState.Auto);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.body);
            Text.fontSize(10);
            Text.fontColor(ProteusHomeColors.TEXT);
            Text.width('100%');
            Text.lineHeight(16);
        }, Text);
        Text.pop();
        Scroll.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 12, right: 12, top: 6, bottom: 12 });
            Row.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.primaryLabel.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    {
                        this.observeComponentCreation2((elmtId, isInitialRender) => {
                            if (isInitialRender) {
                                let componentCall = new ProteusHomeDownloadBtn(this, { label: this.primaryLabel, primary: false, onAction: () => this.onPrimary() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 643, col: 13 });
                                ViewPU.create(componentCall);
                                let paramsLambda = () => {
                                    return {
                                        label: this.primaryLabel,
                                        primary: false,
                                        onAction: () => this.onPrimary()
                                    };
                                };
                                componentCall.paramsGenerator_ = paramsLambda;
                            }
                            else {
                                this.updateStateVarsOfChildByElmtId(elmtId, {
                                    label: this.primaryLabel, primary: false
                                });
                            }
                        }, { name: "ProteusHomeDownloadBtn" });
                    }
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeDownloadBtn(this, { label: 'Close', primary: true, onAction: () => this.onClose() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 645, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Close',
                            primary: true,
                            onAction: () => this.onClose()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Close', primary: true
                    });
                }
            }, { name: "ProteusHomeDownloadBtn" });
        }
        Row.pop();
        Column.pop();
        Stack.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeTextDialog extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertySimpleOneWayPU(params.title, this, "title");
        this.__body = new SynchedPropertySimpleOneWayPU(params.body, this, "body");
        this.onClose = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeTextDialog_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
        if (params.body === undefined) {
            this.__body.set('');
        }
        if (params.onClose !== undefined) {
            this.onClose = params.onClose;
        }
    }
    updateStateVars(params: ProteusHomeTextDialog_Params) {
        this.__title.reset(params.title);
        this.__body.reset(params.body);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
        this.__body.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        this.__body.aboutToBeDeleted();
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
    private __title: SynchedPropertySimpleOneWayPU<string>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: string) {
        this.__title.set(newValue);
    }
    private __body: SynchedPropertySimpleOneWayPU<string>;
    get body() {
        return this.__body.get();
    }
    set body(newValue: string) {
        this.__body.set(newValue);
    }
    private onClose: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Stack.create({ alignContent: Alignment.Center });
            Stack.width('100%');
            Stack.height('100%');
        }, Stack);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor('#00000055');
            Column.onClick(() => this.onClose());
        }, Column);
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(440);
            Column.border({ width: 1, color: ProteusHomeColors.PANEL_BORDER });
            Column.clip(true);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(32);
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(ProteusHomeColors.PANEL_HEAD_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusHomeColors.PANEL_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusHomeColors.PANEL_HEAD_TEXT);
            Text.fontWeight(FontWeight.Bold);
            Text.layoutWeight(1);
            Text.padding({ left: 10 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('×');
            Text.fontSize(16);
            Text.fontColor(ProteusHomeColors.TEXT_DIM);
            Text.width(28);
            Text.textAlign(TextAlign.Center);
            Text.onClick(() => this.onClose());
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height(260);
            Scroll.padding(12);
            Scroll.backgroundColor(ProteusHomeColors.PANEL_INSET);
            Scroll.scrollBar(BarState.Auto);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.body);
            Text.fontSize(10);
            Text.fontColor(ProteusHomeColors.TEXT);
            Text.width('100%');
            Text.lineHeight(16);
        }, Text);
        Text.pop();
        Scroll.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 6 });
            Row.width('100%');
            Row.padding({ left: 12, right: 12, top: 6, bottom: 12 });
            Row.backgroundColor(ProteusHomeColors.PANEL_INSET);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusHomeDownloadBtn(this, { label: 'Close', primary: true, onAction: () => this.onClose() }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusHomeWidgets.ets", line: 712, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: 'Close',
                            primary: true,
                            onAction: () => this.onClose()
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: 'Close', primary: true
                    });
                }
            }, { name: "ProteusHomeDownloadBtn" });
        }
        Row.pop();
        Column.pop();
        Stack.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusHomeBottomStrip extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusLine = new SynchedPropertySimpleOneWayPU(params.statusLine, this, "statusLine");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusHomeBottomStrip_Params) {
        if (params.statusLine === undefined) {
            this.__statusLine.set('Ready');
        }
    }
    updateStateVars(params: ProteusHomeBottomStrip_Params) {
        this.__statusLine.reset(params.statusLine);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusLine.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusLine.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __statusLine: SynchedPropertySimpleOneWayPU<string>;
    get statusLine() {
        return this.__statusLine.get();
    }
    set statusLine(newValue: string) {
        this.__statusLine.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(22);
            Row.padding({ left: 10, right: 10 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(ProteusHomeColors.STATUS_BAR);
            Row.border({ width: { top: 1 }, color: ProteusHomeColors.STATUS_BORDER });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('ElecDraw');
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.STATUS_TEXT);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ right: 10 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.statusLine);
            Text.fontSize(9);
            Text.fontColor(ProteusHomeColors.STATUS_TEXT);
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
