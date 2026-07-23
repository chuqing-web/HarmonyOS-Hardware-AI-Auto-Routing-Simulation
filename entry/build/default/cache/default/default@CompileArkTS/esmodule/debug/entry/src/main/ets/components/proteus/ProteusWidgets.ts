if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface ProteusSwitch_Params {
    themeRev?: number;
    isOn?: boolean;
    onColor?: string;
    widthVp?: number;
    heightVp?: number;
    onChange?: (on: boolean) => void;
}
interface ProteusKeyDescRow_Params {
    themeRev?: number;
    keyLabel?: string;
    description?: string;
    keyWidth?: number;
    onAction?: () => void;
    pressed?: boolean;
    hovered?: boolean;
}
interface ProteusErcRow_Params {
    themeRev?: number;
    mark?: string;
    markColor?: string;
    desc?: string;
    onAction?: () => void;
    pressed?: boolean;
    hovered?: boolean;
}
interface ProteusNavNetRow_Params {
    themeRev?: number;
    label?: string;
    onAction?: () => void;
    pressed?: boolean;
    hovered?: boolean;
}
interface ProteusNavCompRow_Params {
    themeRev?: number;
    refDes?: string;
    libraryId?: string;
    selected?: boolean;
    onAction?: () => void;
    pressed?: boolean;
    hovered?: boolean;
}
interface ProteusPressRow_Params {
    themeRev?: number;
    selected?: boolean;
    heightVal?: number;
    showDivider?: boolean;
    padLeft?: number;
    padRight?: number;
    onAction?: () => void;
    content?: () => void;
    pressed?: boolean;
    hovered?: boolean;
}
interface ProteusResizer_Params {
    themeRev?: number;
    side?: 'left' | 'right';
    onDrag?: (delta: number) => void;
    hovered?: boolean;
    tipVisible?: boolean;
    startOffset?: number;
    lastOffset?: number;
}
interface ProteusToolGroup_Params {
    themeRev?: number;
    title?: string;
    content?: () => void;
}
interface ProteusSidebarTab_Params {
    themeRev?: number;
    label?: string;
    tooltip?: string;
    icon?: ProteusIconName;
    selected?: boolean;
    onSelect?: () => void;
    tipVisible?: boolean;
    pressed?: boolean;
}
interface ProteusMenuEntryRow_Params {
    label?: ResourceStr;
    shortcut?: string;
    disabled?: boolean;
    onAction?: () => void;
    pressed?: boolean;
    hovered?: boolean;
}
interface ProteusMenuTrigger_Params {
    themeRev?: number;
    label?: ResourceStr;
    entries?: ProteusMenuEntry[];
    open?: boolean;
    pressed?: boolean;
}
interface ProteusToolButton_Params {
    themeRev?: number;
    iconName?: ProteusIconName;
    label?: ResourceStr;
    showLabel?: boolean;
    active?: boolean;
    disabled?: boolean;
    tooltip?: string;
    btnSize?: number;
    onAction?: () => void;
    tipVisible?: boolean;
    pressed?: boolean;
}
interface ProteusTextArea_Params {
    themeRev?: number;
    text?: string;
    placeholder?: ResourceStr;
    areaHeight?: number;
    isEnabled?: boolean;
    onChange?: (v: string) => void;
}
interface ProteusTextInput_Params {
    themeRev?: number;
    text?: string;
    placeholder?: ResourceStr;
    password?: boolean;
    isEnabled?: boolean;
    mono?: boolean;
    center?: boolean;
    onChange?: (v: string) => void;
    onSubmit?: () => void;
}
interface ProteusParamRow_Params {
    themeRev?: number;
    label?: ResourceStr;
    value?: string;
    editable?: boolean;
    labelWidth?: number;
    onChange?: (v: string) => void;
}
interface ProteusTreeRow_Params {
    themeRev?: number;
    label?: ResourceStr;
    depth?: number;
    selected?: boolean;
    expandable?: boolean;
    expanded?: boolean;
    hovered?: boolean;
    pressed?: boolean;
    onClickRow?: () => void;
    onDoubleClick?: () => void;
    onToggleExpand?: () => void;
}
interface ProteusCollapsibleSection_Params {
    themeRev?: number;
    title?: ResourceStr;
    expanded?: boolean;
    content?: () => void;
}
interface ProteusNavTab_Params {
    themeRev?: number;
    label?: ResourceStr;
    selected?: boolean;
    onSelect?: () => void;
    pressed?: boolean;
}
interface ProteusMenuItem_Params {
    themeRev?: number;
    label?: ResourceStr;
    pressed?: boolean;
    hovered?: boolean;
    onAction?: () => void;
}
interface ProteusChipGrid_Params {
    themeRev?: number;
    labels?: string[];
    selectedIdx?: number;
    colsPerRow?: number;
    onSelect?: (idx: number) => void;
}
interface ProteusChipTab_Params {
    themeRev?: number;
    label?: string;
    selected?: boolean;
    fillWidth?: boolean;
    onSelect?: () => void;
    pressed?: boolean;
}
interface ProteusSectionTitle_Params {
    themeRev?: number;
    title?: string;
}
interface ProteusClassicBtn_Params {
    themeRev?: number;
    label?: ResourceStr;
    widthVal?: string | number;
    heightVal?: number;
    tooltip?: string;
    onAction?: () => void;
    tipVisible?: boolean;
    pressed?: boolean;
}
interface ProteusToolBtn_Params {
    themeRev?: number;
    label?: string;
    active?: boolean;
    onAction?: () => void;
    pressed?: boolean;
}
interface ProteusVDivider_Params {
    themeRev?: number;
}
interface ProteusPanelTitle_Params {
    themeRev?: number;
    title?: ResourceStr;
    collapsed?: boolean;
    tooltip?: string;
    onToggle?: () => void;
    tipVisible?: boolean;
    pressed?: boolean;
}
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusIcon, ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
/** 经典凹陷边框：抬起=亮上左/暗下右；按下=反转 */
function proteusBtnBorder(pressed: boolean): BorderOptions {
    if (pressed) {
        return {
            width: { left: 1, top: 1, right: 1, bottom: 1 },
            color: { left: '#808080', top: '#808080', right: '#F5F5F5', bottom: '#F5F5F5' }
        };
    }
    return {
        width: { left: 1, top: 1, right: 1, bottom: 1 },
        color: { left: '#F5F5F5', top: '#F5F5F5', right: '#808080', bottom: '#808080' }
    };
}
/** 统一悬停提示气泡 */
export function ProteusTooltipBubble(text: string, parent = null) {
    const __text__ = text;
    (parent ? parent : this).observeComponentCreation2((elmtId, isInitialRender, text = __text__) => {
        Column.create();
        Column.padding({ left: 10, right: 10, top: 6, bottom: 6 });
        Column.backgroundColor('#E6383838');
        Column.borderRadius(4);
        Column.constraintSize({ maxWidth: 320 });
        Column.shadow({ radius: 6, color: '#40000000', offsetX: 0, offsetY: 2 });
    }, Column);
    (parent ? parent : this).observeComponentCreation2((elmtId, isInitialRender, text = __text__) => {
        Text.create(text);
        Text.fontSize(12);
        Text.fontColor('#FFFFFF');
        Text.textAlign(TextAlign.Center);
        Text.maxLines(4);
        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
    }, Text);
    Text.pop();
    Column.pop();
}
export interface ProteusMenuEntry {
    label: ResourceStr;
    shortcut?: string;
    icon?: ProteusIconName;
    separator?: boolean;
    disabled?: boolean;
    action: () => void;
}
export class ProteusPanelTitle extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertyObjectOneWayPU(params.title, this, "title");
        this.__collapsed = new SynchedPropertySimpleOneWayPU(params.collapsed, this, "collapsed");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(params.tooltip, this, "tooltip");
        this.onToggle = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusPanelTitle_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
        if (params.collapsed === undefined) {
            this.__collapsed.set(false);
        }
        if (params.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (params.onToggle !== undefined) {
            this.onToggle = params.onToggle;
        }
        if (params.tipVisible !== undefined) {
            this.tipVisible = params.tipVisible;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusPanelTitle_Params) {
        this.__title.reset(params.title);
        this.__collapsed.reset(params.collapsed);
        this.__tooltip.reset(params.tooltip);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
        this.__collapsed.purgeDependencyOnElmtId(rmElmtId);
        this.__tooltip.purgeDependencyOnElmtId(rmElmtId);
        this.__tipVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        this.__collapsed.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __title: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: ResourceStr) {
        this.__title.set(newValue);
    }
    private __collapsed: SynchedPropertySimpleOneWayPU<boolean>;
    get collapsed() {
        return this.__collapsed.get();
    }
    set collapsed(newValue: boolean) {
        this.__collapsed.set(newValue);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(newValue: string) {
        this.__tooltip.set(newValue);
    }
    private onToggle: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(newValue: boolean) {
        this.__tipVisible.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private tipText(): string {
        if (this.tooltip.length > 0) {
            return this.tooltip;
        }
        return this.collapsed ? '点击展开面板' : '点击折叠面板';
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.PANEL_TITLE_HEIGHT);
            Row.backgroundColor(ProteusColors.PANEL_TITLE_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
            Row.alignItems(VerticalAlign.Center);
            Row.onHover((hover: boolean) => {
                this.tipVisible = hover;
            });
            Row.bindPopup(this.tipVisible, {
                builder: { builder: this.panelTitleTip.bind(this) },
                placement: Placement.Bottom,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (event) => {
                    if (!event.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
            Text.textAlign(TextAlign.Start);
            Text.padding({ left: 8 });
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.createWithChild({ type: ButtonType.Normal });
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.width(28);
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.height(20);
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED : ProteusColors.BTN_BG);
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.borderRadius(0);
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.border(proteusBtnBorder(this.pressed));
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.margin({ right: 4 });
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.stateEffect(false);
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.onClick(() => this.onToggle());
            // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
            Button.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.collapsed ? '▶' : '◀');
            Text.fontSize(12);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Bold);
        }, Text);
        Text.pop();
        // Explicit hit target — ▶▼ alone was 8px and nearly invisible / untappable on left panels
        Button.pop();
        Row.pop();
    }
    panelTitleTip(parent = null) {
        ProteusTooltipBubble.bind(this)(this.tipText());
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusVDivider extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusVDivider_Params) {
    }
    updateStateVars(params: ProteusVDivider_Params) {
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(1);
            Column.height(ProteusDimens.TOOLBAR_HEIGHT - 8);
            Column.backgroundColor(ProteusColors.DIVIDER);
            Column.margin({ left: 2, right: 2 });
        }, Column);
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusToolBtn extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__active = new SynchedPropertySimpleOneWayPU(params.active, this, "active");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusToolBtn_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.active === undefined) {
            this.__active.set(false);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusToolBtn_Params) {
        this.__label.reset(params.label);
        this.__active.reset(params.active);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__active.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__active.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
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
    private __active: SynchedPropertySimpleOneWayPU<boolean>;
    get active() {
        return this.__active.get();
    }
    set active(newValue: boolean) {
        this.__active.set(newValue);
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
        if (this.pressed) {
            return ProteusColors.BTN_PRESSED;
        }
        return this.active ? ProteusColors.TREE_SELECTED : ProteusColors.BTN_BG;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.width(ProteusDimens.TOOL_BTN_SIZE);
            Button.height(ProteusDimens.TOOL_BTN_SIZE);
            Button.padding(0);
            Button.borderRadius(0);
            Button.backgroundColor(this.bg());
            Button.border(proteusBtnBorder(this.pressed));
            Button.scale(this.pressed ? { x: 0.94, y: 0.94 } : { x: 1, y: 1 });
            Button.stateEffect(false);
            Button.onClick(() => this.onAction());
            Button.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.TOOLBAR);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
        }, Text);
        Text.pop();
        Button.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusClassicBtn extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__widthVal = new SynchedPropertySimpleOneWayPU(params.widthVal, this, "widthVal");
        this.__heightVal = new SynchedPropertySimpleOneWayPU(params.heightVal, this, "heightVal");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(params.tooltip, this, "tooltip");
        this.onAction = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusClassicBtn_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.widthVal === undefined) {
            this.__widthVal.set('auto');
        }
        if (params.heightVal === undefined) {
            this.__heightVal.set(ProteusDimens.PARAM_ROW_HEIGHT);
        }
        if (params.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.tipVisible !== undefined) {
            this.tipVisible = params.tipVisible;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusClassicBtn_Params) {
        this.__label.reset(params.label);
        this.__widthVal.reset(params.widthVal);
        this.__heightVal.reset(params.heightVal);
        this.__tooltip.reset(params.tooltip);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__widthVal.purgeDependencyOnElmtId(rmElmtId);
        this.__heightVal.purgeDependencyOnElmtId(rmElmtId);
        this.__tooltip.purgeDependencyOnElmtId(rmElmtId);
        this.__tipVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__widthVal.aboutToBeDeleted();
        this.__heightVal.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __widthVal: SynchedPropertySimpleOneWayPU<string | number>;
    get widthVal() {
        return this.__widthVal.get();
    }
    set widthVal(newValue: string | number) {
        this.__widthVal.set(newValue);
    }
    private __heightVal: SynchedPropertySimpleOneWayPU<number>;
    get heightVal() {
        return this.__heightVal.get();
    }
    set heightVal(newValue: number) {
        this.__heightVal.set(newValue);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(newValue: string) {
        this.__tooltip.set(newValue);
    }
    private onAction: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(newValue: boolean) {
        this.__tipVisible.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private tipText(): string {
        return this.tooltip;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED : ProteusColors.BTN_BG);
            Button.borderRadius(0);
            Button.border(proteusBtnBorder(this.pressed));
            Button.height(this.heightVal);
            Button.width(this.widthVal);
            Button.padding({ left: 6, right: 6 });
            Button.scale(this.pressed ? { x: 0.97, y: 0.94 } : { x: 1, y: 1 });
            Button.stateEffect(false);
            Button.onClick(() => this.onAction());
            Button.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Button.onHover((hover: boolean) => {
                if (this.tipText().length > 0) {
                    this.tipVisible = hover;
                }
            });
            Button.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Top,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (event) => {
                    if (!event.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.BTN_LABEL);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        Button.pop();
    }
    tooltipPopup(parent = null) {
        ProteusTooltipBubble.bind(this)(this.tipText());
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusSectionTitle extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertySimpleOneWayPU(params.title, this, "title");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusSectionTitle_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
    }
    updateStateVars(params: ProteusSectionTitle_Params) {
        this.__title.reset(params.title);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
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
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.width('100%');
            Text.padding({ left: 8, right: 8, top: 8, bottom: 4 });
        }, Text);
        Text.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusChipTab extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.__fillWidth = new SynchedPropertySimpleOneWayPU(params.fillWidth, this, "fillWidth");
        this.onSelect = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusChipTab_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.fillWidth === undefined) {
            this.__fillWidth.set(false);
        }
        if (params.onSelect !== undefined) {
            this.onSelect = params.onSelect;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusChipTab_Params) {
        this.__label.reset(params.label);
        this.__selected.reset(params.selected);
        this.__fillWidth.reset(params.fillWidth);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__fillWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__fillWidth.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
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
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private __fillWidth: SynchedPropertySimpleOneWayPU<boolean>;
    get fillWidth() {
        return this.__fillWidth.get();
    }
    set fillWidth(newValue: boolean) {
        this.__fillWidth.set(newValue);
    }
    private onSelect: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private bg(): string {
        if (this.pressed) {
            return this.selected ? '#0055AA' : ProteusColors.BTN_PRESSED;
        }
        return this.selected ? ProteusColors.TAB_CHIP_ACTIVE_BG : ProteusColors.TAB_CHIP_IDLE_BG;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(this.fillWidth ? '100%' : 'auto');
            Column.layoutWeight(this.fillWidth ? 1 : 0);
            Column.height(ProteusDimens.TAB_CHIP_HEIGHT);
            Column.padding({ left: 4, right: 4 });
            Column.justifyContent(FlexAlign.Center);
            Column.backgroundColor(this.bg());
            Column.border({
                width: this.selected ? { left: 3, top: 1, right: 1, bottom: 1 } : 1,
                color: this.selected ? ProteusColors.SELECTED : ProteusColors.TAB_CHIP_BORDER
            });
            Column.scale(this.pressed ? { x: 0.96, y: 0.92 } : { x: 1, y: 1 });
            Column.onClick(() => this.onSelect());
            Column.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.TAB_CHIP);
            Text.fontColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_TEXT : ProteusColors.TAB_CHIP_IDLE_TEXT);
            Text.fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.textAlign(TextAlign.Center);
            Text.width('100%');
        }, Text);
        Text.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusChipGrid extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__labels = new SynchedPropertyObjectOneWayPU(params.labels, this, "labels");
        this.__selectedIdx = new SynchedPropertySimpleOneWayPU(params.selectedIdx, this, "selectedIdx");
        this.__colsPerRow = new SynchedPropertySimpleOneWayPU(params.colsPerRow, this, "colsPerRow");
        this.onSelect = (_idx: number) => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusChipGrid_Params) {
        if (params.labels === undefined) {
            this.__labels.set([]);
        }
        if (params.selectedIdx === undefined) {
            this.__selectedIdx.set(-1);
        }
        if (params.colsPerRow === undefined) {
            this.__colsPerRow.set(3);
        }
        if (params.onSelect !== undefined) {
            this.onSelect = params.onSelect;
        }
    }
    updateStateVars(params: ProteusChipGrid_Params) {
        this.__labels.reset(params.labels);
        this.__selectedIdx.reset(params.selectedIdx);
        this.__colsPerRow.reset(params.colsPerRow);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__labels.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedIdx.purgeDependencyOnElmtId(rmElmtId);
        this.__colsPerRow.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__labels.aboutToBeDeleted();
        this.__selectedIdx.aboutToBeDeleted();
        this.__colsPerRow.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __labels: SynchedPropertySimpleOneWayPU<string[]>;
    get labels() {
        return this.__labels.get();
    }
    set labels(newValue: string[]) {
        this.__labels.set(newValue);
    }
    private __selectedIdx: SynchedPropertySimpleOneWayPU<number>;
    get selectedIdx() {
        return this.__selectedIdx.get();
    }
    set selectedIdx(newValue: number) {
        this.__selectedIdx.set(newValue);
    }
    private __colsPerRow: SynchedPropertySimpleOneWayPU<number>;
    get colsPerRow() {
        return this.__colsPerRow.get();
    }
    set colsPerRow(newValue: number) {
        this.__colsPerRow.set(newValue);
    }
    private onSelect: (idx: number) => void;
    private rowStarts(): number[] {
        const starts: number[] = [];
        for (let i = 0; i < this.labels.length; i += this.colsPerRow) {
            starts.push(i);
        }
        return starts;
    }
    private rowLabels(start: number): string[] {
        const end = Math.min(start + this.colsPerRow, this.labels.length);
        const slice: string[] = [];
        for (let i = start; i < end; i++) {
            slice.push(this.labels[i]);
        }
        return slice;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 4 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = _item => {
                const start = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    Row.create({ space: 4 });
                    Row.width('100%');
                }, Row);
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    ForEach.create();
                    const forEachItemGenFunction = (_item, offset: number) => {
                        const label = _item;
                        {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                if (isInitialRender) {
                                    let componentCall = new ProteusChipTab(this, {
                                        label: label,
                                        selected: this.selectedIdx === start + offset,
                                        fillWidth: true,
                                        onSelect: () => { this.onSelect(start + offset); }
                                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 350, col: 13 });
                                    ViewPU.create(componentCall);
                                    let paramsLambda = () => {
                                        return {
                                            label: label,
                                            selected: this.selectedIdx === start + offset,
                                            fillWidth: true,
                                            onSelect: () => { this.onSelect(start + offset); }
                                        };
                                    };
                                    componentCall.paramsGenerator_ = paramsLambda;
                                }
                                else {
                                    this.updateStateVarsOfChildByElmtId(elmtId, {
                                        label: label,
                                        selected: this.selectedIdx === start + offset,
                                        fillWidth: true
                                    });
                                }
                            }, { name: "ProteusChipTab" });
                        }
                    };
                    this.forEachUpdateFunction(elmtId, this.rowLabels(start), forEachItemGenFunction, (label: string, offset: number) => `chip_${start}_${offset}_${label}`, true, true);
                }, ForEach);
                ForEach.pop();
                Row.pop();
            };
            this.forEachUpdateFunction(elmtId, this.rowStarts(), forEachItemGenFunction, (start: number) => `chip_row_${start}`, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusMenuItem extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.onAction = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusMenuItem_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
    }
    updateStateVars(params: ProteusMenuItem_Params) {
        this.__label.reset(params.label);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    private onAction: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithLabel(this.label);
            Button.fontSize(ProteusFonts.MENU);
            Button.fontColor(ProteusColors.TEXT_PRIMARY);
            Button.height(ProteusDimens.MENU_HEIGHT);
            Button.padding({ left: 6, right: 6 });
            Button.borderRadius(0);
            Button.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
                (this.hovered ? '#E8E8E8' : ProteusColors.MENU_BG));
            Button.scale(this.pressed ? { x: 0.98, y: 0.92 } : { x: 1, y: 1 });
            Button.stateEffect(false);
            Button.onClick(() => this.onAction());
            Button.onHover((isHover: boolean) => { this.hovered = isHover; });
            Button.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
        }, Button);
        Button.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusNavTab extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.onSelect = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusNavTab_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.onSelect !== undefined) {
            this.onSelect = params.onSelect;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusNavTab_Params) {
        this.__label.reset(params.label);
        this.__selected.reset(params.selected);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private onSelect: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private bg(): string {
        if (this.pressed) {
            return this.selected ? '#0055AA' : ProteusColors.BTN_PRESSED;
        }
        return this.selected ? ProteusColors.TAB_CHIP_ACTIVE_BG : ProteusColors.TAB_CHIP_IDLE_BG;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.TAB_CHIP);
            Text.fontColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_TEXT : ProteusColors.TAB_CHIP_IDLE_TEXT);
            Text.fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.textAlign(TextAlign.Center);
            Text.layoutWeight(1);
            Text.height(ProteusDimens.TAB_BAR_HEIGHT);
            Text.backgroundColor(this.bg());
            Text.border({
                width: { bottom: this.selected ? 2 : 1 },
                color: this.selected ? ProteusColors.BTN_FOCUS : ProteusColors.TAB_CHIP_BORDER
            });
            Text.scale(this.pressed ? { x: 0.98, y: 0.92 } : { x: 1, y: 1 });
            Text.onClick(() => this.onSelect());
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
export class ProteusCollapsibleSection extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertyObjectOneWayPU(params.title, this, "title");
        this.__expanded = new SynchedPropertySimpleTwoWayPU(params.expanded, this, "expanded");
        this.content = undefined;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusCollapsibleSection_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
        if (params.content !== undefined) {
            this.content = params.content;
        }
    }
    updateStateVars(params: ProteusCollapsibleSection_Params) {
        this.__title.reset(params.title);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
        this.__expanded.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        this.__expanded.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __title: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get title() {
        return this.__title.get();
    }
    set title(newValue: ResourceStr) {
        this.__title.set(newValue);
    }
    private __expanded: SynchedPropertySimpleTwoWayPU<boolean>;
    get expanded() {
        return this.__expanded.get();
    }
    set expanded(newValue: boolean) {
        this.__expanded.set(newValue);
    }
    private __content;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusPanelTitle(this, {
                        title: this.title,
                        collapsed: !this.expanded,
                        onToggle: () => { this.expanded = !this.expanded; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 447, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: this.title,
                            collapsed: !this.expanded,
                            onToggle: () => { this.expanded = !this.expanded; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: this.title,
                        collapsed: !this.expanded
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.expanded) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('100%');
                        Column.backgroundColor(ProteusColors.CANVAS_BG);
                        Column.border({ width: { left: 1, right: 1, bottom: 1 }, color: ProteusColors.DIVIDER });
                    }, Column);
                    this.content.bind(this)();
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
export class ProteusTreeRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__depth = new SynchedPropertySimpleOneWayPU(params.depth, this, "depth");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.__expandable = new SynchedPropertySimpleOneWayPU(params.expandable, this, "expandable");
        this.__expanded = new SynchedPropertySimpleOneWayPU(params.expanded, this, "expanded");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.onClickRow = () => { };
        this.onDoubleClick = () => { };
        this.onToggleExpand = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusTreeRow_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.depth === undefined) {
            this.__depth.set(0);
        }
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.expandable === undefined) {
            this.__expandable.set(false);
        }
        if (params.expanded === undefined) {
            this.__expanded.set(false);
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.onClickRow !== undefined) {
            this.onClickRow = params.onClickRow;
        }
        if (params.onDoubleClick !== undefined) {
            this.onDoubleClick = params.onDoubleClick;
        }
        if (params.onToggleExpand !== undefined) {
            this.onToggleExpand = params.onToggleExpand;
        }
    }
    updateStateVars(params: ProteusTreeRow_Params) {
        this.__label.reset(params.label);
        this.__depth.reset(params.depth);
        this.__selected.reset(params.selected);
        this.__expandable.reset(params.expandable);
        this.__expanded.reset(params.expanded);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__depth.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__expandable.purgeDependencyOnElmtId(rmElmtId);
        this.__expanded.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__depth.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__expandable.aboutToBeDeleted();
        this.__expanded.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __depth: SynchedPropertySimpleOneWayPU<number>;
    get depth() {
        return this.__depth.get();
    }
    set depth(newValue: number) {
        this.__depth.set(newValue);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private __expandable: SynchedPropertySimpleOneWayPU<boolean>;
    get expandable() {
        return this.__expandable.get();
    }
    set expandable(newValue: boolean) {
        this.__expandable.set(newValue);
    }
    private __expanded: SynchedPropertySimpleOneWayPU<boolean>;
    get expanded() {
        return this.__expanded.get();
    }
    set expanded(newValue: boolean) {
        this.__expanded.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private onClickRow: () => void;
    private onDoubleClick: () => void;
    private onToggleExpand: () => void;
    private bg(): ResourceColor {
        if (this.pressed) {
            return ProteusColors.BTN_PRESSED;
        }
        if (this.selected) {
            return ProteusColors.TREE_SELECTED;
        }
        return this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.TREE_ROW_HEIGHT);
            Row.padding({ left: 4, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.bg());
            Row.scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 });
            Row.onHover((isHover: boolean) => { this.hovered = isHover; });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => this.onClickRow());
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => this.onDoubleClick());
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.width(this.depth * 12);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.expandable) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.expanded ? '▾' : '▸');
                        Text.fontSize(10);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.width(14);
                        Text.height(14);
                        Text.textAlign(TextAlign.Center);
                        Text.onClick(() => this.onToggleExpand());
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Blank.create();
                        Blank.width(14);
                    }, Blank);
                    Blank.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(this.selected ? FontWeight.Medium : FontWeight.Normal);
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusParamRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__value = new SynchedPropertySimpleOneWayPU(params.value, this, "value");
        this.__editable = new SynchedPropertySimpleOneWayPU(params.editable, this, "editable");
        this.__labelWidth = new SynchedPropertySimpleOneWayPU(params.labelWidth, this, "labelWidth");
        this.onChange = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusParamRow_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.value === undefined) {
            this.__value.set('');
        }
        if (params.editable === undefined) {
            this.__editable.set(false);
        }
        if (params.labelWidth === undefined) {
            this.__labelWidth.set(0);
        }
        if (params.onChange !== undefined) {
            this.onChange = params.onChange;
        }
    }
    updateStateVars(params: ProteusParamRow_Params) {
        this.__label.reset(params.label);
        this.__value.reset(params.value);
        this.__editable.reset(params.editable);
        this.__labelWidth.reset(params.labelWidth);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__value.purgeDependencyOnElmtId(rmElmtId);
        this.__editable.purgeDependencyOnElmtId(rmElmtId);
        this.__labelWidth.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__value.aboutToBeDeleted();
        this.__editable.aboutToBeDeleted();
        this.__labelWidth.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __value: SynchedPropertySimpleOneWayPU<string>;
    get value() {
        return this.__value.get();
    }
    set value(newValue: string) {
        this.__value.set(newValue);
    }
    private __editable: SynchedPropertySimpleOneWayPU<boolean>;
    get editable() {
        return this.__editable.get();
    }
    set editable(newValue: boolean) {
        this.__editable.set(newValue);
    }
    /** 标签列宽；0=使用主题默认。长中文标签（如 LED 阈值）可加大避免 … */
    private __labelWidth: SynchedPropertySimpleOneWayPU<number>;
    get labelWidth() {
        return this.__labelWidth.get();
    }
    set labelWidth(newValue: number) {
        this.__labelWidth.set(newValue);
    }
    private onChange: (v: string) => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.margin({ bottom: ProteusDimens.PARAM_GAP });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(this.labelWidth > 0 ? this.labelWidth : ProteusDimens.PARAM_LABEL_WIDTH);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Clip });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.editable) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        TextInput.create({ text: this.value });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.INPUT);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.placeholderFont({ size: ProteusFonts.INPUT });
                        TextInput.placeholderColor(ProteusColors.TEXT_SECONDARY);
                        TextInput.caretColor(ProteusColors.INPUT_FOCUS);
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.padding({ left: ProteusDimens.INPUT_PAD_H, right: ProteusDimens.INPUT_PAD_H });
                        TextInput.onChange((v: string) => this.onChange(v));
                    }, TextInput);
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.value);
                        Text.layoutWeight(1);
                        Text.fontSize(ProteusFonts.INPUT);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Text.border({ width: 1, color: ProteusColors.DIVIDER });
                        Text.padding({ left: ProteusDimens.INPUT_PAD_H, right: ProteusDimens.INPUT_PAD_H });
                        Text.maxLines(1);
                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
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
export class ProteusTextInput extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__text = new SynchedPropertySimpleOneWayPU(params.text, this, "text");
        this.__placeholder = new SynchedPropertyObjectOneWayPU(params.placeholder, this, "placeholder");
        this.__password = new SynchedPropertySimpleOneWayPU(params.password, this, "password");
        this.__isEnabled = new SynchedPropertySimpleOneWayPU(params.isEnabled, this, "isEnabled");
        this.__mono = new SynchedPropertySimpleOneWayPU(params.mono, this, "mono");
        this.__center = new SynchedPropertySimpleOneWayPU(params.center, this, "center");
        this.onChange = () => { };
        this.onSubmit = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusTextInput_Params) {
        if (params.text === undefined) {
            this.__text.set('');
        }
        if (params.placeholder === undefined) {
            this.__placeholder.set('');
        }
        if (params.password === undefined) {
            this.__password.set(false);
        }
        if (params.isEnabled === undefined) {
            this.__isEnabled.set(true);
        }
        if (params.mono === undefined) {
            this.__mono.set(false);
        }
        if (params.center === undefined) {
            this.__center.set(false);
        }
        if (params.onChange !== undefined) {
            this.onChange = params.onChange;
        }
        if (params.onSubmit !== undefined) {
            this.onSubmit = params.onSubmit;
        }
    }
    updateStateVars(params: ProteusTextInput_Params) {
        this.__text.reset(params.text);
        this.__placeholder.reset(params.placeholder);
        this.__password.reset(params.password);
        this.__isEnabled.reset(params.isEnabled);
        this.__mono.reset(params.mono);
        this.__center.reset(params.center);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__text.purgeDependencyOnElmtId(rmElmtId);
        this.__placeholder.purgeDependencyOnElmtId(rmElmtId);
        this.__password.purgeDependencyOnElmtId(rmElmtId);
        this.__isEnabled.purgeDependencyOnElmtId(rmElmtId);
        this.__mono.purgeDependencyOnElmtId(rmElmtId);
        this.__center.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__text.aboutToBeDeleted();
        this.__placeholder.aboutToBeDeleted();
        this.__password.aboutToBeDeleted();
        this.__isEnabled.aboutToBeDeleted();
        this.__mono.aboutToBeDeleted();
        this.__center.aboutToBeDeleted();
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
    private __text: SynchedPropertySimpleOneWayPU<string>;
    get text() {
        return this.__text.get();
    }
    set text(newValue: string) {
        this.__text.set(newValue);
    }
    private __placeholder: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get placeholder() {
        return this.__placeholder.get();
    }
    set placeholder(newValue: ResourceStr) {
        this.__placeholder.set(newValue);
    }
    private __password: SynchedPropertySimpleOneWayPU<boolean>;
    get password() {
        return this.__password.get();
    }
    set password(newValue: boolean) {
        this.__password.set(newValue);
    }
    private __isEnabled: SynchedPropertySimpleOneWayPU<boolean>;
    get isEnabled() {
        return this.__isEnabled.get();
    }
    set isEnabled(newValue: boolean) {
        this.__isEnabled.set(newValue);
    }
    private __mono: SynchedPropertySimpleOneWayPU<boolean>;
    get mono() {
        return this.__mono.get();
    }
    set mono(newValue: boolean) {
        this.__mono.set(newValue);
    }
    private __center: SynchedPropertySimpleOneWayPU<boolean>;
    get center() {
        return this.__center.get();
    }
    set center(newValue: boolean) {
        this.__center.set(newValue);
    }
    private onChange: (v: string) => void;
    private onSubmit: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextInput.create({ text: this.text, placeholder: this.placeholder });
            TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
            TextInput.fontSize(ProteusFonts.INPUT);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.fontFamily(this.mono ? 'monospace' : 'sans-serif');
            TextInput.placeholderFont({ size: ProteusFonts.INPUT, weight: FontWeight.Normal });
            TextInput.placeholderColor(ProteusColors.TEXT_SECONDARY);
            TextInput.caretColor(ProteusColors.INPUT_FOCUS);
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.padding({ left: ProteusDimens.INPUT_PAD_H, right: ProteusDimens.INPUT_PAD_H });
            TextInput.textAlign(this.center ? TextAlign.Center : TextAlign.Start);
            TextInput.type(this.password ? InputType.Password : InputType.Normal);
            TextInput.enabled(this.isEnabled);
            TextInput.onChange((v: string) => this.onChange(v));
            TextInput.onSubmit(() => this.onSubmit());
        }, TextInput);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusTextArea extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__text = new SynchedPropertySimpleOneWayPU(params.text, this, "text");
        this.__placeholder = new SynchedPropertyObjectOneWayPU(params.placeholder, this, "placeholder");
        this.__areaHeight = new SynchedPropertySimpleOneWayPU(params.areaHeight, this, "areaHeight");
        this.__isEnabled = new SynchedPropertySimpleOneWayPU(params.isEnabled, this, "isEnabled");
        this.onChange = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusTextArea_Params) {
        if (params.text === undefined) {
            this.__text.set('');
        }
        if (params.placeholder === undefined) {
            this.__placeholder.set('');
        }
        if (params.areaHeight === undefined) {
            this.__areaHeight.set(ProteusDimens.TEXTAREA_MIN_HEIGHT);
        }
        if (params.isEnabled === undefined) {
            this.__isEnabled.set(true);
        }
        if (params.onChange !== undefined) {
            this.onChange = params.onChange;
        }
    }
    updateStateVars(params: ProteusTextArea_Params) {
        this.__text.reset(params.text);
        this.__placeholder.reset(params.placeholder);
        this.__areaHeight.reset(params.areaHeight);
        this.__isEnabled.reset(params.isEnabled);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__text.purgeDependencyOnElmtId(rmElmtId);
        this.__placeholder.purgeDependencyOnElmtId(rmElmtId);
        this.__areaHeight.purgeDependencyOnElmtId(rmElmtId);
        this.__isEnabled.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__text.aboutToBeDeleted();
        this.__placeholder.aboutToBeDeleted();
        this.__areaHeight.aboutToBeDeleted();
        this.__isEnabled.aboutToBeDeleted();
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
    private __text: SynchedPropertySimpleOneWayPU<string>;
    get text() {
        return this.__text.get();
    }
    set text(newValue: string) {
        this.__text.set(newValue);
    }
    private __placeholder: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get placeholder() {
        return this.__placeholder.get();
    }
    set placeholder(newValue: ResourceStr) {
        this.__placeholder.set(newValue);
    }
    private __areaHeight: SynchedPropertySimpleOneWayPU<number>;
    get areaHeight() {
        return this.__areaHeight.get();
    }
    set areaHeight(newValue: number) {
        this.__areaHeight.set(newValue);
    }
    private __isEnabled: SynchedPropertySimpleOneWayPU<boolean>;
    get isEnabled() {
        return this.__isEnabled.get();
    }
    set isEnabled(newValue: boolean) {
        this.__isEnabled.set(newValue);
    }
    private onChange: (v: string) => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            TextArea.create({ text: this.text, placeholder: this.placeholder });
            TextArea.height(this.areaHeight);
            TextArea.width('100%');
            TextArea.fontSize(ProteusFonts.INPUT);
            TextArea.fontColor(ProteusColors.TEXT_PRIMARY);
            TextArea.placeholderFont({ size: ProteusFonts.INPUT, weight: FontWeight.Normal });
            TextArea.placeholderColor(ProteusColors.TEXT_SECONDARY);
            TextArea.caretColor(ProteusColors.INPUT_FOCUS);
            TextArea.backgroundColor(ProteusColors.CANVAS_BG);
            TextArea.borderRadius(0);
            TextArea.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextArea.padding({
                left: ProteusDimens.INPUT_PAD_H,
                right: ProteusDimens.INPUT_PAD_H,
                top: 8,
                bottom: 8
            });
            TextArea.enabled(this.isEnabled);
            TextArea.onChange((v: string) => this.onChange(v));
        }, TextArea);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusToolButton extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__iconName = new SynchedPropertySimpleOneWayPU(params.iconName, this, "iconName");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__showLabel = new SynchedPropertySimpleOneWayPU(params.showLabel, this, "showLabel");
        this.__active = new SynchedPropertySimpleOneWayPU(params.active, this, "active");
        this.__disabled = new SynchedPropertySimpleOneWayPU(params.disabled, this, "disabled");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(params.tooltip, this, "tooltip");
        this.__btnSize = new SynchedPropertySimpleOneWayPU(params.btnSize, this, "btnSize");
        this.onAction = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusToolButton_Params) {
        if (params.iconName === undefined) {
            this.__iconName.set(ProteusIconName.SEARCH);
        }
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.showLabel === undefined) {
            this.__showLabel.set(true);
        }
        if (params.active === undefined) {
            this.__active.set(false);
        }
        if (params.disabled === undefined) {
            this.__disabled.set(false);
        }
        if (params.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (params.btnSize === undefined) {
            this.__btnSize.set(24);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.tipVisible !== undefined) {
            this.tipVisible = params.tipVisible;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusToolButton_Params) {
        this.__iconName.reset(params.iconName);
        this.__label.reset(params.label);
        this.__showLabel.reset(params.showLabel);
        this.__active.reset(params.active);
        this.__disabled.reset(params.disabled);
        this.__tooltip.reset(params.tooltip);
        this.__btnSize.reset(params.btnSize);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__iconName.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__showLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__active.purgeDependencyOnElmtId(rmElmtId);
        this.__disabled.purgeDependencyOnElmtId(rmElmtId);
        this.__tooltip.purgeDependencyOnElmtId(rmElmtId);
        this.__btnSize.purgeDependencyOnElmtId(rmElmtId);
        this.__tipVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__iconName.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__showLabel.aboutToBeDeleted();
        this.__active.aboutToBeDeleted();
        this.__disabled.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__btnSize.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __iconName: SynchedPropertySimpleOneWayPU<ProteusIconName>;
    get iconName() {
        return this.__iconName.get();
    }
    set iconName(newValue: ProteusIconName) {
        this.__iconName.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __showLabel: SynchedPropertySimpleOneWayPU<boolean>;
    get showLabel() {
        return this.__showLabel.get();
    }
    set showLabel(newValue: boolean) {
        this.__showLabel.set(newValue);
    }
    private __active: SynchedPropertySimpleOneWayPU<boolean>;
    get active() {
        return this.__active.get();
    }
    set active(newValue: boolean) {
        this.__active.set(newValue);
    }
    private __disabled: SynchedPropertySimpleOneWayPU<boolean>;
    get disabled() {
        return this.__disabled.get();
    }
    set disabled(newValue: boolean) {
        this.__disabled.set(newValue);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(newValue: string) {
        this.__tooltip.set(newValue);
    }
    private __btnSize: SynchedPropertySimpleOneWayPU<number>;
    get btnSize() {
        return this.__btnSize.get();
    }
    set btnSize(newValue: number) {
        this.__btnSize.set(newValue);
    }
    private onAction: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(newValue: boolean) {
        this.__tipVisible.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private bg(): string {
        if (this.disabled) {
            return ProteusColors.INPUT_READONLY_BG;
        }
        if (this.pressed) {
            return ProteusColors.BTN_PRESSED;
        }
        return this.active ? ProteusColors.TREE_SELECTED : ProteusColors.BTN_BG;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.height(this.btnSize);
            Button.constraintSize({ minWidth: this.showLabel ? 0 : this.btnSize, maxWidth: this.showLabel ? 220 : this.btnSize });
            Button.padding({ left: 3, right: 3 });
            Button.borderRadius(0);
            Button.backgroundColor(this.bg());
            Button.border(this.disabled ? { width: 1, color: ProteusColors.INPUT_BORDER } :
                proteusBtnBorder(this.pressed || this.active));
            Button.scale((this.pressed && !this.disabled) ? { x: 0.94, y: 0.94 } : { x: 1, y: 1 });
            Button.enabled(!this.disabled);
            Button.stateEffect(false);
            Button.onClick(() => { if (!this.disabled)
                this.onAction(); });
            Button.onTouch((event: TouchEvent) => {
                if (this.disabled) {
                    return;
                }
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Button.onHover((hover: boolean) => {
                if (!this.disabled && this.tooltip.length > 0) {
                    this.tipVisible = hover;
                }
            });
            Button.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Top,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (event) => {
                    if (!event.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.justifyContent(FlexAlign.Center);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusIcon(this, {
                        name: this.iconName,
                        iconSize: 14,
                        color: this.disabled ? ProteusColors.TEXT_SECONDARY :
                            (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 685, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            name: this.iconName,
                            iconSize: 14,
                            color: this.disabled ? ProteusColors.TEXT_SECONDARY :
                                (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        name: this.iconName,
                        iconSize: 14,
                        color: this.disabled ? ProteusColors.TEXT_SECONDARY :
                            (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
                    });
                }
            }, { name: "ProteusIcon" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.showLabel && this.label !== '') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.label);
                        Text.fontSize(ProteusFonts.TOOLBAR);
                        Text.fontColor(this.disabled ? ProteusColors.TEXT_SECONDARY :
                            (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY));
                        Text.fontWeight(this.active ? FontWeight.Medium : FontWeight.Normal);
                        Text.maxLines(1);
                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                        Text.margin({ left: 3 });
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
        Button.pop();
    }
    tooltipPopup(parent = null) {
        ProteusTooltipBubble.bind(this)(this.tooltip);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusMenuTrigger extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.entries = [];
        this.__open = new ObservedPropertySimplePU(false, this, "open");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusMenuTrigger_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.entries !== undefined) {
            this.entries = params.entries;
        }
        if (params.open !== undefined) {
            this.open = params.open;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusMenuTrigger_Params) {
        this.__label.reset(params.label);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__open.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__open.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private entries: ProteusMenuEntry[];
    private __open: ObservedPropertySimplePU<boolean>;
    get open() {
        return this.__open.get();
    }
    set open(newValue: boolean) {
        this.__open.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.height(ProteusDimens.MENU_HEIGHT);
            Button.padding({ left: 6, right: 4 });
            Button.borderRadius(0);
            Button.backgroundColor(this.pressed || this.open ? ProteusColors.BTN_PRESSED : ProteusColors.MENU_BG);
            Button.border(proteusBtnBorder(this.pressed || this.open));
            Button.scale(this.pressed ? { x: 0.98, y: 0.92 } : { x: 1, y: 1 });
            Button.stateEffect(false);
            Button.onClick(() => { this.open = true; });
            Button.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Button.bindMenu({ builder: this.buildMenu.bind(this) });
        }, Button);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.MENU);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.margin({ left: 2 });
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusIcon(this, { name: ProteusIconName.CHEVRON_DOWN, iconSize: 8, color: ProteusColors.TEXT_SECONDARY }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 768, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            name: ProteusIconName.CHEVRON_DOWN,
                            iconSize: 8,
                            color: ProteusColors.TEXT_SECONDARY
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        name: ProteusIconName.CHEVRON_DOWN, iconSize: 8, color: ProteusColors.TEXT_SECONDARY
                    });
                }
            }, { name: "ProteusIcon" });
        }
        __Common__.pop();
        Row.pop();
        Button.pop();
    }
    buildMenu(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(220);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.WINDOW_BORDER });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            ForEach.create();
            const forEachItemGenFunction = (_item, idx: number) => {
                const e = _item;
                this.observeComponentCreation2((elmtId, isInitialRender) => {
                    If.create();
                    if (e.separator) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Divider.create();
                                Divider.color(ProteusColors.DIVIDER);
                                Divider.height(1);
                                Divider.width('100%');
                            }, Divider);
                        });
                    }
                    else {
                        this.ifElseBranchUpdateFunction(1, () => {
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusMenuEntryRow(this, {
                                            label: e.label,
                                            shortcut: e.shortcut ?? '',
                                            disabled: e.disabled === true,
                                            onAction: () => {
                                                this.open = false;
                                                e.action();
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 797, col: 11 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                label: e.label,
                                                shortcut: e.shortcut ?? '',
                                                disabled: e.disabled === true,
                                                onAction: () => {
                                                    this.open = false;
                                                    e.action();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            label: e.label,
                                            shortcut: e.shortcut ?? '',
                                            disabled: e.disabled === true
                                        });
                                    }
                                }, { name: "ProteusMenuEntryRow" });
                            }
                        });
                    }
                }, If);
                If.pop();
            };
            this.forEachUpdateFunction(elmtId, this.entries, forEachItemGenFunction, (e: ProteusMenuEntry, idx: number) => `${idx}_${e.shortcut ?? ''}`, true, true);
        }, ForEach);
        ForEach.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
class ProteusMenuEntryRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(params.label, this, "label");
        this.__shortcut = new SynchedPropertySimpleOneWayPU(params.shortcut, this, "shortcut");
        this.__disabled = new SynchedPropertySimpleOneWayPU(params.disabled, this, "disabled");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusMenuEntryRow_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.shortcut === undefined) {
            this.__shortcut.set('');
        }
        if (params.disabled === undefined) {
            this.__disabled.set(false);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
    }
    updateStateVars(params: ProteusMenuEntryRow_Params) {
        this.__label.reset(params.label);
        this.__shortcut.reset(params.shortcut);
        this.__disabled.reset(params.disabled);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__shortcut.purgeDependencyOnElmtId(rmElmtId);
        this.__disabled.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__shortcut.aboutToBeDeleted();
        this.__disabled.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(newValue: ResourceStr) {
        this.__label.set(newValue);
    }
    private __shortcut: SynchedPropertySimpleOneWayPU<string>;
    get shortcut() {
        return this.__shortcut.get();
    }
    set shortcut(newValue: string) {
        this.__shortcut.set(newValue);
    }
    private __disabled: SynchedPropertySimpleOneWayPU<boolean>;
    get disabled() {
        return this.__disabled.get();
    }
    set disabled(newValue: boolean) {
        this.__disabled.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(24);
            Row.padding({ left: 8, right: 8 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
                (this.hovered ? ProteusColors.MENU_HOVER : Color.Transparent));
            Row.scale(this.pressed ? { x: 0.99, y: 0.92 } : { x: 1, y: 1 });
            Row.enabled(!this.disabled);
            Row.onHover((h: boolean) => { this.hovered = h; });
            Row.onTouch((event: TouchEvent) => {
                if (this.disabled) {
                    return;
                }
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => {
                if (!this.disabled) {
                    this.onAction();
                }
            });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
            Blank.width(16);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.MENU);
            Text.fontColor(this.disabled ? ProteusColors.TEXT_SECONDARY : ProteusColors.TEXT_PRIMARY);
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.shortcut.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(this.shortcut);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.margin({ left: 12 });
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
export class ProteusSidebarTab extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(params.tooltip, this, "tooltip");
        this.__icon = new SynchedPropertySimpleOneWayPU(params.icon, this, "icon");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.onSelect = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusSidebarTab_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (params.icon === undefined) {
            this.__icon.set(ProteusIconName.SETTINGS);
        }
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.onSelect !== undefined) {
            this.onSelect = params.onSelect;
        }
        if (params.tipVisible !== undefined) {
            this.tipVisible = params.tipVisible;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
    }
    updateStateVars(params: ProteusSidebarTab_Params) {
        this.__label.reset(params.label);
        this.__tooltip.reset(params.tooltip);
        this.__icon.reset(params.icon);
        this.__selected.reset(params.selected);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__tooltip.purgeDependencyOnElmtId(rmElmtId);
        this.__icon.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__tipVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__icon.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
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
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(newValue: string) {
        this.__tooltip.set(newValue);
    }
    private __icon: SynchedPropertySimpleOneWayPU<ProteusIconName>;
    get icon() {
        return this.__icon.get();
    }
    set icon(newValue: ProteusIconName) {
        this.__icon.set(newValue);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private onSelect: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(newValue: boolean) {
        this.__tipVisible.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private tipText(): string {
        return this.tooltip.length > 0 ? this.tooltip : this.label;
    }
    private bg(): string {
        if (this.pressed) {
            return this.selected ? '#E8E8E8' : '#909090';
        }
        return this.selected ?
            ProteusColors.SIDEBAR_TAB_ACTIVE_BG : ProteusColors.SIDEBAR_TAB_IDLE_BG;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(44);
            Column.height(50);
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor(this.bg());
            Column.border({
                width: {
                    left: this.selected ? 3 : 0,
                    bottom: 1
                },
                color: this.selected ?
                    ProteusColors.BTN_FOCUS : ProteusColors.SIDEBAR_TAB_BORDER
            });
            Column.scale(this.pressed ? { x: 0.94, y: 0.94 } : { x: 1, y: 1 });
            Column.onClick(() => { this.onSelect(); });
            Column.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Column.onHover((hover: boolean) => {
                if (this.tipText().length > 0) {
                    this.tipVisible = hover;
                }
            });
            Column.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Left,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (event) => {
                    if (!event.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusIcon(this, {
                        name: this.icon,
                        iconSize: 16,
                        color: this.selected ?
                            ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 897, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            name: this.icon,
                            iconSize: 16,
                            color: this.selected ?
                                ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        name: this.icon,
                        iconSize: 16,
                        color: this.selected ?
                            ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
                    });
                }
            }, { name: "ProteusIcon" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(9);
            Text.fontColor(this.selected ?
                ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT);
            Text.fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.margin({ top: 2 });
        }, Text);
        Text.pop();
        Column.pop();
    }
    tooltipPopup(parent = null) {
        ProteusTooltipBubble.bind(this)(this.tipText());
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusToolGroup extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__title = new SynchedPropertySimpleOneWayPU(params.title, this, "title");
        this.content = undefined;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusToolGroup_Params) {
        if (params.title === undefined) {
            this.__title.set('');
        }
        if (params.content !== undefined) {
            this.content = params.content;
        }
    }
    updateStateVars(params: ProteusToolGroup_Params) {
        this.__title.reset(params.title);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__title.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__title.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
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
    private __content;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.title);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.height(ProteusDimens.TOOLBAR_HEIGHT);
            Text.align(Alignment.Center);
            Text.margin({ left: 4, right: 2 });
        }, Text);
        Text.pop();
        this.content.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(1);
            Column.height(ProteusDimens.TOOLBAR_HEIGHT - 8);
            Column.backgroundColor(ProteusColors.DIVIDER);
            Column.margin({ left: 4, right: 4 });
        }, Column);
        Column.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusResizer extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__side = new SynchedPropertySimpleOneWayPU(params.side, this, "side");
        this.onDrag = () => { };
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.startOffset = 0;
        this.lastOffset = 0;
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusResizer_Params) {
        if (params.side === undefined) {
            this.__side.set('right');
        }
        if (params.onDrag !== undefined) {
            this.onDrag = params.onDrag;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
        if (params.tipVisible !== undefined) {
            this.tipVisible = params.tipVisible;
        }
        if (params.startOffset !== undefined) {
            this.startOffset = params.startOffset;
        }
        if (params.lastOffset !== undefined) {
            this.lastOffset = params.lastOffset;
        }
    }
    updateStateVars(params: ProteusResizer_Params) {
        this.__side.reset(params.side);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__side.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
        this.__tipVisible.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__side.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __side: SynchedPropertySimpleOneWayPU<'left' | 'right'>;
    get side() {
        return this.__side.get();
    }
    set side(newValue: 'left' | 'right') {
        this.__side.set(newValue);
    }
    private onDrag: (delta: number) => void;
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(newValue: boolean) {
        this.__tipVisible.set(newValue);
    }
    private startOffset: number;
    private lastOffset: number;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(4);
            Column.height('100%');
            Column.backgroundColor(this.hovered ? ProteusColors.BTN_FOCUS : ProteusColors.DIVIDER);
            Column.onHover((h: boolean) => {
                this.hovered = h;
                this.tipVisible = h;
            });
            Column.bindPopup(this.tipVisible, {
                builder: { builder: this.resizerTip.bind(this) },
                placement: this.side === 'right' ? Placement.Left : Placement.Right,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (event) => {
                    if (!event.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
            globalThis.Gesture.create(GesturePriority.Low);
            PanGesture.create();
            PanGesture.onActionStart((e: GestureEvent) => {
                this.startOffset = e.offsetX;
                this.lastOffset = e.offsetX;
            });
            PanGesture.onActionUpdate((e: GestureEvent) => {
                const delta = e.offsetX - this.lastOffset;
                this.lastOffset = e.offsetX;
                const dx = this.side === 'right' ? -delta : delta;
                this.onDrag(dx);
            });
            PanGesture.pop();
            globalThis.Gesture.pop();
            Column.hitTestBehavior(HitTestMode.Block);
        }, Column);
        Column.pop();
    }
    resizerTip(parent = null) {
        ProteusTooltipBubble.bind(this)('拖动调整面板宽度');
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusPressRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.__heightVal = new SynchedPropertySimpleOneWayPU(params.heightVal, this, "heightVal");
        this.__showDivider = new SynchedPropertySimpleOneWayPU(params.showDivider, this, "showDivider");
        this.__padLeft = new SynchedPropertySimpleOneWayPU(params.padLeft, this, "padLeft");
        this.__padRight = new SynchedPropertySimpleOneWayPU(params.padRight, this, "padRight");
        this.onAction = () => { };
        this.content = undefined;
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusPressRow_Params) {
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.heightVal === undefined) {
            this.__heightVal.set(ProteusDimens.NAV_ROW_HEIGHT);
        }
        if (params.showDivider === undefined) {
            this.__showDivider.set(true);
        }
        if (params.padLeft === undefined) {
            this.__padLeft.set(6);
        }
        if (params.padRight === undefined) {
            this.__padRight.set(4);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.content !== undefined) {
            this.content = params.content;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
    }
    updateStateVars(params: ProteusPressRow_Params) {
        this.__selected.reset(params.selected);
        this.__heightVal.reset(params.heightVal);
        this.__showDivider.reset(params.showDivider);
        this.__padLeft.reset(params.padLeft);
        this.__padRight.reset(params.padRight);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__heightVal.purgeDependencyOnElmtId(rmElmtId);
        this.__showDivider.purgeDependencyOnElmtId(rmElmtId);
        this.__padLeft.purgeDependencyOnElmtId(rmElmtId);
        this.__padRight.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__heightVal.aboutToBeDeleted();
        this.__showDivider.aboutToBeDeleted();
        this.__padLeft.aboutToBeDeleted();
        this.__padRight.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private __heightVal: SynchedPropertySimpleOneWayPU<number>;
    get heightVal() {
        return this.__heightVal.get();
    }
    set heightVal(newValue: number) {
        this.__heightVal.set(newValue);
    }
    private __showDivider: SynchedPropertySimpleOneWayPU<boolean>;
    get showDivider() {
        return this.__showDivider.get();
    }
    set showDivider(newValue: boolean) {
        this.__showDivider.set(newValue);
    }
    private __padLeft: SynchedPropertySimpleOneWayPU<number>;
    get padLeft() {
        return this.__padLeft.get();
    }
    set padLeft(newValue: number) {
        this.__padLeft.set(newValue);
    }
    private __padRight: SynchedPropertySimpleOneWayPU<number>;
    get padRight() {
        return this.__padRight.get();
    }
    set padRight(newValue: number) {
        this.__padRight.set(newValue);
    }
    private onAction: () => void;
    private __content;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    private bg(): ResourceColor {
        if (this.pressed) {
            return ProteusColors.BTN_PRESSED;
        }
        if (this.selected) {
            return ProteusColors.TREE_SELECTED;
        }
        return this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(this.heightVal);
            Row.padding({ left: this.padLeft, right: this.padRight });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.bg());
            Row.border(this.showDivider ? { width: { bottom: 0.5 }, color: ProteusColors.DIVIDER } :
                { width: 0, color: Color.Transparent });
            Row.scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 });
            Row.onHover((h: boolean) => { this.hovered = h; });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => this.onAction());
        }, Row);
        this.content.bind(this)();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusNavCompRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__refDes = new SynchedPropertySimpleOneWayPU(params.refDes, this, "refDes");
        this.__libraryId = new SynchedPropertySimpleOneWayPU(params.libraryId, this, "libraryId");
        this.__selected = new SynchedPropertySimpleOneWayPU(params.selected, this, "selected");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusNavCompRow_Params) {
        if (params.refDes === undefined) {
            this.__refDes.set('');
        }
        if (params.libraryId === undefined) {
            this.__libraryId.set('');
        }
        if (params.selected === undefined) {
            this.__selected.set(false);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
    }
    updateStateVars(params: ProteusNavCompRow_Params) {
        this.__refDes.reset(params.refDes);
        this.__libraryId.reset(params.libraryId);
        this.__selected.reset(params.selected);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__refDes.purgeDependencyOnElmtId(rmElmtId);
        this.__libraryId.purgeDependencyOnElmtId(rmElmtId);
        this.__selected.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__refDes.aboutToBeDeleted();
        this.__libraryId.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __refDes: SynchedPropertySimpleOneWayPU<string>;
    get refDes() {
        return this.__refDes.get();
    }
    set refDes(newValue: string) {
        this.__refDes.set(newValue);
    }
    private __libraryId: SynchedPropertySimpleOneWayPU<string>;
    get libraryId() {
        return this.__libraryId.get();
    }
    set libraryId(newValue: string) {
        this.__libraryId.set(newValue);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(newValue: boolean) {
        this.__selected.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    private bg(): ResourceColor {
        if (this.pressed) {
            return ProteusColors.BTN_PRESSED;
        }
        if (this.selected) {
            return ProteusColors.TREE_SELECTED;
        }
        return this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent;
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.NAV_ROW_HEIGHT);
            Row.padding({ left: 6, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.bg());
            Row.border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER });
            Row.scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 });
            Row.onHover((h: boolean) => { this.hovered = h; });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => this.onAction());
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.refDes);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.selected ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.width(60);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.libraryId);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
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
export class ProteusNavNetRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__label = new SynchedPropertySimpleOneWayPU(params.label, this, "label");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusNavNetRow_Params) {
        if (params.label === undefined) {
            this.__label.set('');
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
    }
    updateStateVars(params: ProteusNavNetRow_Params) {
        this.__label.reset(params.label);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__label.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
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
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.NAV_ROW_HEIGHT + 2);
            Row.padding({ left: 8, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
                (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent));
            Row.border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER });
            Row.scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 });
            Row.onHover((h: boolean) => { this.hovered = h; });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => this.onAction());
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.WIRE);
            Text.fontWeight(FontWeight.Medium);
            Text.maxLines(1);
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusErcRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__mark = new SynchedPropertySimpleOneWayPU(params.mark, this, "mark");
        this.__markColor = new SynchedPropertySimpleOneWayPU(params.markColor, this, "markColor");
        this.__desc = new SynchedPropertySimpleOneWayPU(params.desc, this, "desc");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusErcRow_Params) {
        if (params.mark === undefined) {
            this.__mark.set('⚠');
        }
        if (params.markColor === undefined) {
            this.__markColor.set(ProteusColors.ERC_WARN);
        }
        if (params.desc === undefined) {
            this.__desc.set('');
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
    }
    updateStateVars(params: ProteusErcRow_Params) {
        this.__mark.reset(params.mark);
        this.__markColor.reset(params.markColor);
        this.__desc.reset(params.desc);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__mark.purgeDependencyOnElmtId(rmElmtId);
        this.__markColor.purgeDependencyOnElmtId(rmElmtId);
        this.__desc.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__mark.aboutToBeDeleted();
        this.__markColor.aboutToBeDeleted();
        this.__desc.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __mark: SynchedPropertySimpleOneWayPU<string>;
    get mark() {
        return this.__mark.get();
    }
    set mark(newValue: string) {
        this.__mark.set(newValue);
    }
    private __markColor: SynchedPropertySimpleOneWayPU<string>;
    get markColor() {
        return this.__markColor.get();
    }
    set markColor(newValue: string) {
        this.__markColor.set(newValue);
    }
    private __desc: SynchedPropertySimpleOneWayPU<string>;
    get desc() {
        return this.__desc.get();
    }
    set desc(newValue: string) {
        this.__desc.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.NAV_ROW_HEIGHT);
            Row.padding({ left: 6, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
                (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent));
            Row.border({ width: { bottom: 0.5 }, color: ProteusColors.DIVIDER });
            Row.scale(this.pressed ? { x: 0.995, y: 0.92 } : { x: 1, y: 1 });
            Row.onHover((h: boolean) => { this.hovered = h; });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => this.onAction());
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.mark);
            Text.fontSize(10);
            Text.fontColor(this.markColor);
            Text.width(16);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.desc);
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.markColor);
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
export class ProteusKeyDescRow extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__keyLabel = new SynchedPropertySimpleOneWayPU(params.keyLabel, this, "keyLabel");
        this.__description = new SynchedPropertySimpleOneWayPU(params.description, this, "description");
        this.__keyWidth = new SynchedPropertySimpleOneWayPU(params.keyWidth, this, "keyWidth");
        this.onAction = () => { };
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusKeyDescRow_Params) {
        if (params.keyLabel === undefined) {
            this.__keyLabel.set('');
        }
        if (params.description === undefined) {
            this.__description.set('');
        }
        if (params.keyWidth === undefined) {
            this.__keyWidth.set(72);
        }
        if (params.onAction !== undefined) {
            this.onAction = params.onAction;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.hovered !== undefined) {
            this.hovered = params.hovered;
        }
    }
    updateStateVars(params: ProteusKeyDescRow_Params) {
        this.__keyLabel.reset(params.keyLabel);
        this.__description.reset(params.description);
        this.__keyWidth.reset(params.keyWidth);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__keyLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__description.purgeDependencyOnElmtId(rmElmtId);
        this.__keyWidth.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
        this.__hovered.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__keyLabel.aboutToBeDeleted();
        this.__description.aboutToBeDeleted();
        this.__keyWidth.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __keyLabel: SynchedPropertySimpleOneWayPU<string>;
    get keyLabel() {
        return this.__keyLabel.get();
    }
    set keyLabel(newValue: string) {
        this.__keyLabel.set(newValue);
    }
    private __description: SynchedPropertySimpleOneWayPU<string>;
    get description() {
        return this.__description.get();
    }
    set description(newValue: string) {
        this.__description.set(newValue);
    }
    private __keyWidth: SynchedPropertySimpleOneWayPU<number>;
    get keyWidth() {
        return this.__keyWidth.get();
    }
    set keyWidth(newValue: number) {
        this.__keyWidth.set(newValue);
    }
    private onAction: () => void;
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(newValue: boolean) {
        this.__hovered.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 12, right: 8, top: 4, bottom: 4 });
            Row.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED :
                (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent));
            Row.scale(this.pressed ? { x: 0.99, y: 0.94 } : { x: 1, y: 1 });
            Row.onHover((h: boolean) => { this.hovered = h; });
            Row.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Row.onClick(() => this.onAction());
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.keyLabel);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.DIGITAL);
            Text.width(this.keyWidth);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.description);
            Text.fontSize(10);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.layoutWeight(1);
        }, Text);
        Text.pop();
        Row.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusSwitch extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__isOn = new SynchedPropertySimpleOneWayPU(params.isOn, this, "isOn");
        this.__onColor = new SynchedPropertySimpleOneWayPU(params.onColor, this, "onColor");
        this.__widthVp = new SynchedPropertySimpleOneWayPU(params.widthVp, this, "widthVp");
        this.__heightVp = new SynchedPropertySimpleOneWayPU(params.heightVp, this, "heightVp");
        this.onChange = (_on: boolean) => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ProteusSwitch_Params) {
        if (params.isOn === undefined) {
            this.__isOn.set(false);
        }
        if (params.onColor === undefined) {
            this.__onColor.set('');
        }
        if (params.widthVp === undefined) {
            this.__widthVp.set(48);
        }
        if (params.heightVp === undefined) {
            this.__heightVp.set(28);
        }
        if (params.onChange !== undefined) {
            this.onChange = params.onChange;
        }
    }
    updateStateVars(params: ProteusSwitch_Params) {
        this.__isOn.reset(params.isOn);
        this.__onColor.reset(params.onColor);
        this.__widthVp.reset(params.widthVp);
        this.__heightVp.reset(params.heightVp);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__isOn.purgeDependencyOnElmtId(rmElmtId);
        this.__onColor.purgeDependencyOnElmtId(rmElmtId);
        this.__widthVp.purgeDependencyOnElmtId(rmElmtId);
        this.__heightVp.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__isOn.aboutToBeDeleted();
        this.__onColor.aboutToBeDeleted();
        this.__widthVp.aboutToBeDeleted();
        this.__heightVp.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    /** 订阅主题版本：色板变更后强制本组件 rebuild */
    private __themeRev: ObservedPropertyAbstractPU<number>;
    get themeRev() {
        return this.__themeRev.get();
    }
    set themeRev(newValue: number) {
        this.__themeRev.set(newValue);
    }
    private __isOn: SynchedPropertySimpleOneWayPU<boolean>;
    get isOn() {
        return this.__isOn.get();
    }
    set isOn(newValue: boolean) {
        this.__isOn.set(newValue);
    }
    private __onColor: SynchedPropertySimpleOneWayPU<string>;
    get onColor() {
        return this.__onColor.get();
    }
    set onColor(newValue: string) {
        this.__onColor.set(newValue);
    }
    private __widthVp: SynchedPropertySimpleOneWayPU<number>;
    get widthVp() {
        return this.__widthVp.get();
    }
    set widthVp(newValue: number) {
        this.__widthVp.set(newValue);
    }
    private __heightVp: SynchedPropertySimpleOneWayPU<number>;
    get heightVp() {
        return this.__heightVp.get();
    }
    set heightVp(newValue: number) {
        this.__heightVp.set(newValue);
    }
    private onChange: (on: boolean) => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Toggle.create({ type: ToggleType.Switch, isOn: this.isOn });
            Toggle.selectedColor(this.onColor.length > 0 ? this.onColor : ProteusColors.BTN_FOCUS);
            Toggle.switchPointColor(ProteusColors.TOGGLE_KNOB);
            Toggle.switchStyle({
                unselectedColor: ProteusColors.TOGGLE_OFF_TRACK,
                pointColor: ProteusColors.TOGGLE_KNOB
            });
            Toggle.width(this.widthVp);
            Toggle.height(this.heightVp);
            Toggle.onChange((on: boolean) => {
                this.onChange(on);
            });
        }, Toggle);
        Toggle.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
