if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface ProteusResizer_Params {
    side?: 'left' | 'right';
    onDrag?: (delta: number) => void;
    hovered?: boolean;
    tipVisible?: boolean;
    startOffset?: number;
    lastOffset?: number;
}
interface ProteusToolGroup_Params {
    title?: string;
    content?: () => void;
}
interface ProteusSidebarTab_Params {
    label?: string;
    tooltip?: string;
    icon?: ProteusIconName;
    selected?: boolean;
    onSelect?: () => void;
    tipVisible?: boolean;
}
interface ProteusMenuTrigger_Params {
    label?: ResourceStr;
    entries?: ProteusMenuEntry[];
    open?: boolean;
}
interface ProteusToolButton_Params {
    iconName?: ProteusIconName;
    label?: ResourceStr;
    showLabel?: boolean;
    active?: boolean;
    disabled?: boolean;
    tooltip?: string;
    btnSize?: number;
    onAction?: () => void;
    tipVisible?: boolean;
}
interface ProteusParamRow_Params {
    label?: ResourceStr;
    value?: string;
    editable?: boolean;
    onChange?: (v: string) => void;
}
interface ProteusTreeRow_Params {
    label?: ResourceStr;
    depth?: number;
    selected?: boolean;
    expandable?: boolean;
    expanded?: boolean;
    hovered?: boolean;
    onClickRow?: () => void;
    onDoubleClick?: () => void;
    onToggleExpand?: () => void;
}
interface ProteusCollapsibleSection_Params {
    title?: ResourceStr;
    expanded?: boolean;
    content?: () => void;
}
interface ProteusNavTab_Params {
    label?: ResourceStr;
    selected?: boolean;
    onSelect?: () => void;
}
interface ProteusMenuItem_Params {
    label?: ResourceStr;
    pressed?: boolean;
    hovered?: boolean;
    onAction?: () => void;
}
interface ProteusChipGrid_Params {
    labels?: string[];
    selectedIdx?: number;
    colsPerRow?: number;
    onSelect?: (idx: number) => void;
}
interface ProteusChipTab_Params {
    label?: string;
    selected?: boolean;
    fillWidth?: boolean;
    onSelect?: () => void;
}
interface ProteusSectionTitle_Params {
    title?: string;
}
interface ProteusClassicBtn_Params {
    label?: ResourceStr;
    widthVal?: string | number;
    heightVal?: number;
    tooltip?: string;
    onAction?: () => void;
    tipVisible?: boolean;
}
interface ProteusToolBtn_Params {
    label?: string;
    active?: boolean;
    onAction?: () => void;
}
interface ProteusVDivider_Params {
}
interface ProteusPanelTitle_Params {
    title?: ResourceStr;
    collapsed?: boolean;
    tooltip?: string;
    onToggle?: () => void;
    tipVisible?: boolean;
}
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { ProteusIcon, ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
export function ProteusTooltipBubble(x141: string, y141 = null) {
    const z141 = x141;
    (y141 ? y141 : this).observeComponentCreation2((d142, e142, f142 = z141) => {
        Column.create();
        Column.padding({ left: 10, right: 10, top: 6, bottom: 6 });
        Column.backgroundColor('#E6383838');
        Column.borderRadius(4);
        Column.constraintSize({ maxWidth: 320 });
        Column.shadow({ radius: 6, color: '#40000000', offsetX: 0, offsetY: 2 });
    }, Column);
    (y141 ? y141 : this).observeComponentCreation2((a142, b142, c142 = z141) => {
        Text.create(c142);
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
    constructor(r141, s141, t141, u141 = -1, v141 = undefined, w141) {
        super(r141, t141, u141, w141);
        if (typeof v141 === "function") {
            this.paramsGenerator_ = v141;
        }
        this.__title = new SynchedPropertyObjectOneWayPU(s141.title, this, "title");
        this.__collapsed = new SynchedPropertySimpleOneWayPU(s141.collapsed, this, "collapsed");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(s141.tooltip, this, "tooltip");
        this.onToggle = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.setInitiallyProvidedValue(s141);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(q141: ProteusPanelTitle_Params) {
        if (q141.title === undefined) {
            this.__title.set('');
        }
        if (q141.collapsed === undefined) {
            this.__collapsed.set(false);
        }
        if (q141.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (q141.onToggle !== undefined) {
            this.onToggle = q141.onToggle;
        }
        if (q141.tipVisible !== undefined) {
            this.tipVisible = q141.tipVisible;
        }
    }
    updateStateVars(p141: ProteusPanelTitle_Params) {
        this.__title.reset(p141.title);
        this.__collapsed.reset(p141.collapsed);
        this.__tooltip.reset(p141.tooltip);
    }
    purgeVariableDependenciesOnElmtId(o141) {
        this.__title.purgeDependencyOnElmtId(o141);
        this.__collapsed.purgeDependencyOnElmtId(o141);
        this.__tooltip.purgeDependencyOnElmtId(o141);
        this.__tipVisible.purgeDependencyOnElmtId(o141);
    }
    aboutToBeDeleted() {
        this.__title.aboutToBeDeleted();
        this.__collapsed.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __title: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get title() {
        return this.__title.get();
    }
    set title(n141: ResourceStr) {
        this.__title.set(n141);
    }
    private __collapsed: SynchedPropertySimpleOneWayPU<boolean>;
    get collapsed() {
        return this.__collapsed.get();
    }
    set collapsed(m141: boolean) {
        this.__collapsed.set(m141);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(l141: string) {
        this.__tooltip.set(l141);
    }
    private onToggle: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(k141: boolean) {
        this.__tipVisible.set(k141);
    }
    private tipText(): string {
        if (this.tooltip.length > 0) {
            return this.tooltip;
        }
        return this.collapsed ? '点击展开面板' : '点击折叠面板';
    }
    initialRender() {
        this.observeComponentCreation2((g141, h141) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.PANEL_TITLE_HEIGHT);
            Row.backgroundColor(ProteusColors.PANEL_TITLE_BG);
            Row.border({ width: { bottom: 1 }, color: ProteusColors.DIVIDER });
            Row.alignItems(VerticalAlign.Center);
            Row.onClick(() => this.onToggle());
            Row.onHover((j141: boolean) => {
                this.tipVisible = j141;
            });
            Row.bindPopup(this.tipVisible, {
                builder: { builder: this.panelTitleTip.bind(this) },
                placement: Placement.Bottom,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (i141) => {
                    if (!i141.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Row);
        this.observeComponentCreation2((e141, f141) => {
            Text.create(this.title);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontWeight(FontWeight.Medium);
            Text.layoutWeight(1);
            Text.textAlign(TextAlign.Center);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((c141, d141) => {
            Text.create(this.collapsed ? '▶' : '▼');
            Text.fontSize(8);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.margin({ right: 4 });
        }, Text);
        Text.pop();
        Row.pop();
    }
    panelTitleTip(b141 = null) {
        ProteusTooltipBubble.bind(this)(this.tipText());
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusVDivider extends ViewPU {
    constructor(v140, w140, x140, y140 = -1, z140 = undefined, a141) {
        super(v140, x140, y140, a141);
        if (typeof z140 === "function") {
            this.paramsGenerator_ = z140;
        }
        this.setInitiallyProvidedValue(w140);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(u140: ProteusVDivider_Params) {
    }
    updateStateVars(t140: ProteusVDivider_Params) {
    }
    purgeVariableDependenciesOnElmtId(s140) {
    }
    aboutToBeDeleted() {
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    initialRender() {
        this.observeComponentCreation2((q140, r140) => {
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
    constructor(k140, l140, m140, n140 = -1, o140 = undefined, p140) {
        super(k140, m140, n140, p140);
        if (typeof o140 === "function") {
            this.paramsGenerator_ = o140;
        }
        this.__label = new SynchedPropertySimpleOneWayPU(l140.label, this, "label");
        this.__active = new SynchedPropertySimpleOneWayPU(l140.active, this, "active");
        this.onAction = () => { };
        this.setInitiallyProvidedValue(l140);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(j140: ProteusToolBtn_Params) {
        if (j140.label === undefined) {
            this.__label.set('');
        }
        if (j140.active === undefined) {
            this.__active.set(false);
        }
        if (j140.onAction !== undefined) {
            this.onAction = j140.onAction;
        }
    }
    updateStateVars(i140: ProteusToolBtn_Params) {
        this.__label.reset(i140.label);
        this.__active.reset(i140.active);
    }
    purgeVariableDependenciesOnElmtId(h140) {
        this.__label.purgeDependencyOnElmtId(h140);
        this.__active.purgeDependencyOnElmtId(h140);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__active.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(g140: string) {
        this.__label.set(g140);
    }
    private __active: SynchedPropertySimpleOneWayPU<boolean>;
    get active() {
        return this.__active.get();
    }
    set active(f140: boolean) {
        this.__active.set(f140);
    }
    private onAction: () => void;
    initialRender() {
        this.observeComponentCreation2((d140, e140) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.width(ProteusDimens.TOOL_BTN_SIZE);
            Button.height(ProteusDimens.TOOL_BTN_SIZE);
            Button.padding(0);
            Button.borderRadius(0);
            Button.backgroundColor(this.active ? ProteusColors.TREE_SELECTED : ProteusColors.BTN_BG);
            Button.border({ width: 1, color: ProteusColors.DIVIDER });
            Button.onClick(() => this.onAction());
        }, Button);
        this.observeComponentCreation2((b140, c140) => {
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
    constructor(v139, w139, x139, y139 = -1, z139 = undefined, a140) {
        super(v139, x139, y139, a140);
        if (typeof z139 === "function") {
            this.paramsGenerator_ = z139;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(w139.label, this, "label");
        this.__widthVal = new SynchedPropertySimpleOneWayPU(w139.widthVal, this, "widthVal");
        this.__heightVal = new SynchedPropertySimpleOneWayPU(w139.heightVal, this, "heightVal");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(w139.tooltip, this, "tooltip");
        this.onAction = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.setInitiallyProvidedValue(w139);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(u139: ProteusClassicBtn_Params) {
        if (u139.label === undefined) {
            this.__label.set('');
        }
        if (u139.widthVal === undefined) {
            this.__widthVal.set('auto');
        }
        if (u139.heightVal === undefined) {
            this.__heightVal.set(ProteusDimens.PARAM_ROW_HEIGHT);
        }
        if (u139.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (u139.onAction !== undefined) {
            this.onAction = u139.onAction;
        }
        if (u139.tipVisible !== undefined) {
            this.tipVisible = u139.tipVisible;
        }
    }
    updateStateVars(t139: ProteusClassicBtn_Params) {
        this.__label.reset(t139.label);
        this.__widthVal.reset(t139.widthVal);
        this.__heightVal.reset(t139.heightVal);
        this.__tooltip.reset(t139.tooltip);
    }
    purgeVariableDependenciesOnElmtId(s139) {
        this.__label.purgeDependencyOnElmtId(s139);
        this.__widthVal.purgeDependencyOnElmtId(s139);
        this.__heightVal.purgeDependencyOnElmtId(s139);
        this.__tooltip.purgeDependencyOnElmtId(s139);
        this.__tipVisible.purgeDependencyOnElmtId(s139);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__widthVal.aboutToBeDeleted();
        this.__heightVal.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(r139: ResourceStr) {
        this.__label.set(r139);
    }
    private __widthVal: SynchedPropertySimpleOneWayPU<string | number>;
    get widthVal() {
        return this.__widthVal.get();
    }
    set widthVal(q139: string | number) {
        this.__widthVal.set(q139);
    }
    private __heightVal: SynchedPropertySimpleOneWayPU<number>;
    get heightVal() {
        return this.__heightVal.get();
    }
    set heightVal(p139: number) {
        this.__heightVal.set(p139);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(o139: string) {
        this.__tooltip.set(o139);
    }
    private onAction: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(n139: boolean) {
        this.__tipVisible.set(n139);
    }
    private tipText(): string {
        return this.tooltip;
    }
    initialRender() {
        this.observeComponentCreation2((j139, k139) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.backgroundColor(ProteusColors.BTN_BG);
            Button.borderRadius(0);
            Button.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            Button.height(this.heightVal);
            Button.width(this.widthVal);
            Button.padding({ left: 6, right: 6 });
            Button.onClick(() => this.onAction());
            Button.onHover((m139: boolean) => {
                if (this.tipText().length > 0) {
                    this.tipVisible = m139;
                }
            });
            Button.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Top,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (l139) => {
                    if (!l139.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Button);
        this.observeComponentCreation2((h139, i139) => {
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
    tooltipPopup(g139 = null) {
        ProteusTooltipBubble.bind(this)(this.tipText());
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusSectionTitle extends ViewPU {
    constructor(a139, b139, c139, d139 = -1, e139 = undefined, f139) {
        super(a139, c139, d139, f139);
        if (typeof e139 === "function") {
            this.paramsGenerator_ = e139;
        }
        this.__title = new SynchedPropertySimpleOneWayPU(b139.title, this, "title");
        this.setInitiallyProvidedValue(b139);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(z138: ProteusSectionTitle_Params) {
        if (z138.title === undefined) {
            this.__title.set('');
        }
    }
    updateStateVars(y138: ProteusSectionTitle_Params) {
        this.__title.reset(y138.title);
    }
    purgeVariableDependenciesOnElmtId(x138) {
        this.__title.purgeDependencyOnElmtId(x138);
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
    set title(w138: string) {
        this.__title.set(w138);
    }
    initialRender() {
        this.observeComponentCreation2((u138, v138) => {
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
    constructor(o138, p138, q138, r138 = -1, s138 = undefined, t138) {
        super(o138, q138, r138, t138);
        if (typeof s138 === "function") {
            this.paramsGenerator_ = s138;
        }
        this.__label = new SynchedPropertySimpleOneWayPU(p138.label, this, "label");
        this.__selected = new SynchedPropertySimpleOneWayPU(p138.selected, this, "selected");
        this.__fillWidth = new SynchedPropertySimpleOneWayPU(p138.fillWidth, this, "fillWidth");
        this.onSelect = () => { };
        this.setInitiallyProvidedValue(p138);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(n138: ProteusChipTab_Params) {
        if (n138.label === undefined) {
            this.__label.set('');
        }
        if (n138.selected === undefined) {
            this.__selected.set(false);
        }
        if (n138.fillWidth === undefined) {
            this.__fillWidth.set(false);
        }
        if (n138.onSelect !== undefined) {
            this.onSelect = n138.onSelect;
        }
    }
    updateStateVars(m138: ProteusChipTab_Params) {
        this.__label.reset(m138.label);
        this.__selected.reset(m138.selected);
        this.__fillWidth.reset(m138.fillWidth);
    }
    purgeVariableDependenciesOnElmtId(l138) {
        this.__label.purgeDependencyOnElmtId(l138);
        this.__selected.purgeDependencyOnElmtId(l138);
        this.__fillWidth.purgeDependencyOnElmtId(l138);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__fillWidth.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(k138: string) {
        this.__label.set(k138);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(j138: boolean) {
        this.__selected.set(j138);
    }
    private __fillWidth: SynchedPropertySimpleOneWayPU<boolean>;
    get fillWidth() {
        return this.__fillWidth.get();
    }
    set fillWidth(i138: boolean) {
        this.__fillWidth.set(i138);
    }
    private onSelect: () => void;
    initialRender() {
        this.observeComponentCreation2((g138, h138) => {
            Column.create();
            Column.width(this.fillWidth ? '100%' : 'auto');
            Column.layoutWeight(this.fillWidth ? 1 : 0);
            Column.height(ProteusDimens.TAB_CHIP_HEIGHT);
            Column.padding({ left: 4, right: 4 });
            Column.justifyContent(FlexAlign.Center);
            Column.backgroundColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_BG : ProteusColors.TAB_CHIP_IDLE_BG);
            Column.border({
                width: this.selected ? { left: 3, top: 1, right: 1, bottom: 1 } : 1,
                color: this.selected ? ProteusColors.SELECTED : ProteusColors.TAB_CHIP_BORDER
            });
            Column.onClick(() => this.onSelect());
        }, Column);
        this.observeComponentCreation2((e138, f138) => {
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
    constructor(x137, y137, z137, a138 = -1, b138 = undefined, c138) {
        super(x137, z137, a138, c138);
        if (typeof b138 === "function") {
            this.paramsGenerator_ = b138;
        }
        this.__labels = new SynchedPropertyObjectOneWayPU(y137.labels, this, "labels");
        this.__selectedIdx = new SynchedPropertySimpleOneWayPU(y137.selectedIdx, this, "selectedIdx");
        this.__colsPerRow = new SynchedPropertySimpleOneWayPU(y137.colsPerRow, this, "colsPerRow");
        this.onSelect = (d138: number) => { };
        this.setInitiallyProvidedValue(y137);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(w137: ProteusChipGrid_Params) {
        if (w137.labels === undefined) {
            this.__labels.set([]);
        }
        if (w137.selectedIdx === undefined) {
            this.__selectedIdx.set(-1);
        }
        if (w137.colsPerRow === undefined) {
            this.__colsPerRow.set(3);
        }
        if (w137.onSelect !== undefined) {
            this.onSelect = w137.onSelect;
        }
    }
    updateStateVars(v137: ProteusChipGrid_Params) {
        this.__labels.reset(v137.labels);
        this.__selectedIdx.reset(v137.selectedIdx);
        this.__colsPerRow.reset(v137.colsPerRow);
    }
    purgeVariableDependenciesOnElmtId(u137) {
        this.__labels.purgeDependencyOnElmtId(u137);
        this.__selectedIdx.purgeDependencyOnElmtId(u137);
        this.__colsPerRow.purgeDependencyOnElmtId(u137);
    }
    aboutToBeDeleted() {
        this.__labels.aboutToBeDeleted();
        this.__selectedIdx.aboutToBeDeleted();
        this.__colsPerRow.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __labels: SynchedPropertySimpleOneWayPU<string[]>;
    get labels() {
        return this.__labels.get();
    }
    set labels(t137: string[]) {
        this.__labels.set(t137);
    }
    private __selectedIdx: SynchedPropertySimpleOneWayPU<number>;
    get selectedIdx() {
        return this.__selectedIdx.get();
    }
    set selectedIdx(s137: number) {
        this.__selectedIdx.set(s137);
    }
    private __colsPerRow: SynchedPropertySimpleOneWayPU<number>;
    get colsPerRow() {
        return this.__colsPerRow.get();
    }
    set colsPerRow(r137: number) {
        this.__colsPerRow.set(r137);
    }
    private onSelect: (idx: number) => void;
    private rowStarts(): number[] {
        const p137: number[] = [];
        for (let q137 = 0; q137 < this.labels.length; q137 += this.colsPerRow) {
            p137.push(q137);
        }
        return p137;
    }
    private rowLabels(l137: number): string[] {
        const m137 = Math.min(l137 + this.colsPerRow, this.labels.length);
        const n137: string[] = [];
        for (let o137 = l137; o137 < m137; o137++) {
            n137.push(this.labels[o137]);
        }
        return n137;
    }
    initialRender() {
        this.observeComponentCreation2((j137, k137) => {
            Column.create({ space: 4 });
            Column.width('100%');
        }, Column);
        this.observeComponentCreation2((p136, q136) => {
            ForEach.create();
            const r136 = t136 => {
                const u136 = t136;
                this.observeComponentCreation2((h137, i137) => {
                    Row.create({ space: 4 });
                    Row.width('100%');
                }, Row);
                this.observeComponentCreation2((v136, w136) => {
                    ForEach.create();
                    const x136 = (a137, b137: number) => {
                        const c137 = a137;
                        {
                            this.observeComponentCreation2((d137, e137) => {
                                if (e137) {
                                    let f137 = new ProteusChipTab(this, {
                                        label: c137,
                                        selected: this.selectedIdx === u136 + b137,
                                        fillWidth: true,
                                        onSelect: () => { this.onSelect(u136 + b137); }
                                    }, undefined, d137, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 256, col: 13 });
                                    ViewPU.create(f137);
                                    let g137 = () => {
                                        return {
                                            label: c137,
                                            selected: this.selectedIdx === u136 + b137,
                                            fillWidth: true,
                                            onSelect: () => { this.onSelect(u136 + b137); }
                                        };
                                    };
                                    f137.paramsGenerator_ = g137;
                                }
                                else {
                                    this.updateStateVarsOfChildByElmtId(d137, {
                                        label: c137,
                                        selected: this.selectedIdx === u136 + b137,
                                        fillWidth: true
                                    });
                                }
                            }, { name: "ProteusChipTab" });
                        }
                    };
                    this.forEachUpdateFunction(v136, this.rowLabels(u136), x136, (y136: string, z136: number) => `chip_${u136}_${z136}_${y136}`, true, true);
                }, ForEach);
                ForEach.pop();
                Row.pop();
            };
            this.forEachUpdateFunction(p136, this.rowStarts(), r136, (s136: number) => `chip_row_${s136}`, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusMenuItem extends ViewPU {
    constructor(j136, k136, l136, m136 = -1, n136 = undefined, o136) {
        super(j136, l136, m136, o136);
        if (typeof n136 === "function") {
            this.paramsGenerator_ = n136;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(k136.label, this, "label");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.onAction = () => { };
        this.setInitiallyProvidedValue(k136);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(i136: ProteusMenuItem_Params) {
        if (i136.label === undefined) {
            this.__label.set('');
        }
        if (i136.pressed !== undefined) {
            this.pressed = i136.pressed;
        }
        if (i136.hovered !== undefined) {
            this.hovered = i136.hovered;
        }
        if (i136.onAction !== undefined) {
            this.onAction = i136.onAction;
        }
    }
    updateStateVars(h136: ProteusMenuItem_Params) {
        this.__label.reset(h136.label);
    }
    purgeVariableDependenciesOnElmtId(g136) {
        this.__label.purgeDependencyOnElmtId(g136);
        this.__pressed.purgeDependencyOnElmtId(g136);
        this.__hovered.purgeDependencyOnElmtId(g136);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(f136: ResourceStr) {
        this.__label.set(f136);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(e136: boolean) {
        this.__pressed.set(e136);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(d136: boolean) {
        this.__hovered.set(d136);
    }
    private onAction: () => void;
    initialRender() {
        this.observeComponentCreation2((z135, a136) => {
            Button.createWithLabel(this.label);
            Button.fontSize(ProteusFonts.MENU);
            Button.fontColor(ProteusColors.TEXT_PRIMARY);
            Button.height(ProteusDimens.MENU_HEIGHT);
            Button.padding({ left: 6, right: 6 });
            Button.borderRadius(0);
            Button.backgroundColor(this.pressed ? ProteusColors.MENU_HOVER :
                (this.hovered ? '#E8E8E8' : ProteusColors.MENU_BG));
            Button.onClick(() => this.onAction());
            Button.onHover((c136: boolean) => { this.hovered = c136; });
            Button.onTouch((b136: TouchEvent) => {
                if (b136.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (b136.type === TouchType.Up || b136.type === TouchType.Cancel) {
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
    constructor(t135, u135, v135, w135 = -1, x135 = undefined, y135) {
        super(t135, v135, w135, y135);
        if (typeof x135 === "function") {
            this.paramsGenerator_ = x135;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(u135.label, this, "label");
        this.__selected = new SynchedPropertySimpleOneWayPU(u135.selected, this, "selected");
        this.onSelect = () => { };
        this.setInitiallyProvidedValue(u135);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(s135: ProteusNavTab_Params) {
        if (s135.label === undefined) {
            this.__label.set('');
        }
        if (s135.selected === undefined) {
            this.__selected.set(false);
        }
        if (s135.onSelect !== undefined) {
            this.onSelect = s135.onSelect;
        }
    }
    updateStateVars(r135: ProteusNavTab_Params) {
        this.__label.reset(r135.label);
        this.__selected.reset(r135.selected);
    }
    purgeVariableDependenciesOnElmtId(q135) {
        this.__label.purgeDependencyOnElmtId(q135);
        this.__selected.purgeDependencyOnElmtId(q135);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(p135: ResourceStr) {
        this.__label.set(p135);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(o135: boolean) {
        this.__selected.set(o135);
    }
    private onSelect: () => void;
    initialRender() {
        this.observeComponentCreation2((m135, n135) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.TAB_CHIP);
            Text.fontColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_TEXT : ProteusColors.TAB_CHIP_IDLE_TEXT);
            Text.fontWeight(this.selected ? FontWeight.Bold : FontWeight.Medium);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            Text.textAlign(TextAlign.Center);
            Text.layoutWeight(1);
            Text.height(ProteusDimens.TAB_BAR_HEIGHT);
            Text.backgroundColor(this.selected ? ProteusColors.TAB_CHIP_ACTIVE_BG : ProteusColors.TAB_CHIP_IDLE_BG);
            Text.border({
                width: { bottom: this.selected ? 2 : 1 },
                color: this.selected ? ProteusColors.BTN_FOCUS : ProteusColors.TAB_CHIP_BORDER
            });
            Text.onClick(() => this.onSelect());
        }, Text);
        Text.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusCollapsibleSection extends ViewPU {
    constructor(g135, h135, i135, j135 = -1, k135 = undefined, l135) {
        super(g135, i135, j135, l135);
        if (typeof k135 === "function") {
            this.paramsGenerator_ = k135;
        }
        this.__title = new SynchedPropertyObjectOneWayPU(h135.title, this, "title");
        this.__expanded = new SynchedPropertySimpleTwoWayPU(h135.expanded, this, "expanded");
        this.content = undefined;
        this.setInitiallyProvidedValue(h135);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(f135: ProteusCollapsibleSection_Params) {
        if (f135.title === undefined) {
            this.__title.set('');
        }
        if (f135.content !== undefined) {
            this.content = f135.content;
        }
    }
    updateStateVars(e135: ProteusCollapsibleSection_Params) {
        this.__title.reset(e135.title);
    }
    purgeVariableDependenciesOnElmtId(d135) {
        this.__title.purgeDependencyOnElmtId(d135);
        this.__expanded.purgeDependencyOnElmtId(d135);
    }
    aboutToBeDeleted() {
        this.__title.aboutToBeDeleted();
        this.__expanded.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __title: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get title() {
        return this.__title.get();
    }
    set title(c135: ResourceStr) {
        this.__title.set(c135);
    }
    private __expanded: SynchedPropertySimpleTwoWayPU<boolean>;
    get expanded() {
        return this.__expanded.get();
    }
    set expanded(b135: boolean) {
        this.__expanded.set(b135);
    }
    private __content;
    initialRender() {
        this.observeComponentCreation2((z134, a135) => {
            Column.create();
            Column.width('100%');
        }, Column);
        {
            this.observeComponentCreation2((v134, w134) => {
                if (w134) {
                    let x134 = new ProteusPanelTitle(this, {
                        title: this.title,
                        collapsed: !this.expanded,
                        onToggle: () => { this.expanded = !this.expanded; }
                    }, undefined, v134, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 329, col: 7 });
                    ViewPU.create(x134);
                    let y134 = () => {
                        return {
                            title: this.title,
                            collapsed: !this.expanded,
                            onToggle: () => { this.expanded = !this.expanded; }
                        };
                    };
                    x134.paramsGenerator_ = y134;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(v134, {
                        title: this.title,
                        collapsed: !this.expanded
                    });
                }
            }, { name: "ProteusPanelTitle" });
        }
        this.observeComponentCreation2((r134, s134) => {
            If.create();
            if (this.expanded) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((t134, u134) => {
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
    constructor(l134, m134, n134, o134 = -1, p134 = undefined, q134) {
        super(l134, n134, o134, q134);
        if (typeof p134 === "function") {
            this.paramsGenerator_ = p134;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(m134.label, this, "label");
        this.__depth = new SynchedPropertySimpleOneWayPU(m134.depth, this, "depth");
        this.__selected = new SynchedPropertySimpleOneWayPU(m134.selected, this, "selected");
        this.__expandable = new SynchedPropertySimpleOneWayPU(m134.expandable, this, "expandable");
        this.__expanded = new SynchedPropertySimpleOneWayPU(m134.expanded, this, "expanded");
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.onClickRow = () => { };
        this.onDoubleClick = () => { };
        this.onToggleExpand = () => { };
        this.setInitiallyProvidedValue(m134);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(k134: ProteusTreeRow_Params) {
        if (k134.label === undefined) {
            this.__label.set('');
        }
        if (k134.depth === undefined) {
            this.__depth.set(0);
        }
        if (k134.selected === undefined) {
            this.__selected.set(false);
        }
        if (k134.expandable === undefined) {
            this.__expandable.set(false);
        }
        if (k134.expanded === undefined) {
            this.__expanded.set(false);
        }
        if (k134.hovered !== undefined) {
            this.hovered = k134.hovered;
        }
        if (k134.onClickRow !== undefined) {
            this.onClickRow = k134.onClickRow;
        }
        if (k134.onDoubleClick !== undefined) {
            this.onDoubleClick = k134.onDoubleClick;
        }
        if (k134.onToggleExpand !== undefined) {
            this.onToggleExpand = k134.onToggleExpand;
        }
    }
    updateStateVars(j134: ProteusTreeRow_Params) {
        this.__label.reset(j134.label);
        this.__depth.reset(j134.depth);
        this.__selected.reset(j134.selected);
        this.__expandable.reset(j134.expandable);
        this.__expanded.reset(j134.expanded);
    }
    purgeVariableDependenciesOnElmtId(i134) {
        this.__label.purgeDependencyOnElmtId(i134);
        this.__depth.purgeDependencyOnElmtId(i134);
        this.__selected.purgeDependencyOnElmtId(i134);
        this.__expandable.purgeDependencyOnElmtId(i134);
        this.__expanded.purgeDependencyOnElmtId(i134);
        this.__hovered.purgeDependencyOnElmtId(i134);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__depth.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__expandable.aboutToBeDeleted();
        this.__expanded.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(h134: ResourceStr) {
        this.__label.set(h134);
    }
    private __depth: SynchedPropertySimpleOneWayPU<number>;
    get depth() {
        return this.__depth.get();
    }
    set depth(g134: number) {
        this.__depth.set(g134);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(f134: boolean) {
        this.__selected.set(f134);
    }
    private __expandable: SynchedPropertySimpleOneWayPU<boolean>;
    get expandable() {
        return this.__expandable.get();
    }
    set expandable(e134: boolean) {
        this.__expandable.set(e134);
    }
    private __expanded: SynchedPropertySimpleOneWayPU<boolean>;
    get expanded() {
        return this.__expanded.get();
    }
    set expanded(d134: boolean) {
        this.__expanded.set(d134);
    }
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(c134: boolean) {
        this.__hovered.set(c134);
    }
    private onClickRow: () => void;
    private onDoubleClick: () => void;
    private onToggleExpand: () => void;
    initialRender() {
        this.observeComponentCreation2((z133, a134) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.TREE_ROW_HEIGHT);
            Row.padding({ left: 4, right: 4 });
            Row.alignItems(VerticalAlign.Center);
            Row.backgroundColor(this.selected ? ProteusColors.TREE_SELECTED :
                (this.hovered ? ProteusColors.TREE_HOVER : Color.Transparent));
            Row.onHover((b134: boolean) => { this.hovered = b134; });
            Row.onClick(() => this.onClickRow());
            globalThis.Gesture.create(GesturePriority.Low);
            TapGesture.create({ count: 2 });
            TapGesture.onAction(() => this.onDoubleClick());
            TapGesture.pop();
            globalThis.Gesture.pop();
        }, Row);
        this.observeComponentCreation2((x133, y133) => {
            Blank.create();
            Blank.width(this.depth * 12);
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((r133, s133) => {
            If.create();
            if (this.expandable) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((v133, w133) => {
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
                    this.observeComponentCreation2((t133, u133) => {
                        Blank.create();
                        Blank.width(14);
                    }, Blank);
                    Blank.pop();
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((p133, q133) => {
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
    constructor(j133, k133, l133, m133 = -1, n133 = undefined, o133) {
        super(j133, l133, m133, o133);
        if (typeof n133 === "function") {
            this.paramsGenerator_ = n133;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(k133.label, this, "label");
        this.__value = new SynchedPropertySimpleOneWayPU(k133.value, this, "value");
        this.__editable = new SynchedPropertySimpleOneWayPU(k133.editable, this, "editable");
        this.onChange = () => { };
        this.setInitiallyProvidedValue(k133);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(i133: ProteusParamRow_Params) {
        if (i133.label === undefined) {
            this.__label.set('');
        }
        if (i133.value === undefined) {
            this.__value.set('');
        }
        if (i133.editable === undefined) {
            this.__editable.set(false);
        }
        if (i133.onChange !== undefined) {
            this.onChange = i133.onChange;
        }
    }
    updateStateVars(h133: ProteusParamRow_Params) {
        this.__label.reset(h133.label);
        this.__value.reset(h133.value);
        this.__editable.reset(h133.editable);
    }
    purgeVariableDependenciesOnElmtId(g133) {
        this.__label.purgeDependencyOnElmtId(g133);
        this.__value.purgeDependencyOnElmtId(g133);
        this.__editable.purgeDependencyOnElmtId(g133);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__value.aboutToBeDeleted();
        this.__editable.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(f133: ResourceStr) {
        this.__label.set(f133);
    }
    private __value: SynchedPropertySimpleOneWayPU<string>;
    get value() {
        return this.__value.get();
    }
    set value(e133: string) {
        this.__value.set(e133);
    }
    private __editable: SynchedPropertySimpleOneWayPU<boolean>;
    get editable() {
        return this.__editable.get();
    }
    set editable(d133: boolean) {
        this.__editable.set(d133);
    }
    private onChange: (v: string) => void;
    initialRender() {
        this.observeComponentCreation2((b133, c133) => {
            Row.create();
            Row.width('100%');
            Row.margin({ bottom: ProteusDimens.PARAM_GAP });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((z132, a133) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.width(ProteusDimens.PARAM_LABEL_WIDTH);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((s132, t132) => {
            If.create();
            if (this.editable) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((w132, x132) => {
                        TextInput.create({ text: this.value });
                        TextInput.layoutWeight(1);
                        TextInput.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        TextInput.fontSize(ProteusFonts.PARAM_VALUE);
                        TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
                        TextInput.backgroundColor(ProteusColors.CANVAS_BG);
                        TextInput.borderRadius(0);
                        TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
                        TextInput.padding({ left: 4, right: 4 });
                        TextInput.onChange((y132: string) => this.onChange(y132));
                    }, TextInput);
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((u132, v132) => {
                        Text.create(this.value);
                        Text.layoutWeight(1);
                        Text.fontSize(ProteusFonts.PARAM_VALUE);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.height(ProteusDimens.PARAM_ROW_HEIGHT);
                        Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                        Text.border({ width: 1, color: ProteusColors.DIVIDER });
                        Text.padding({ left: 4, right: 4 });
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
export class ProteusToolButton extends ViewPU {
    constructor(m132, n132, o132, p132 = -1, q132 = undefined, r132) {
        super(m132, o132, p132, r132);
        if (typeof q132 === "function") {
            this.paramsGenerator_ = q132;
        }
        this.__iconName = new SynchedPropertySimpleOneWayPU(n132.iconName, this, "iconName");
        this.__label = new SynchedPropertyObjectOneWayPU(n132.label, this, "label");
        this.__showLabel = new SynchedPropertySimpleOneWayPU(n132.showLabel, this, "showLabel");
        this.__active = new SynchedPropertySimpleOneWayPU(n132.active, this, "active");
        this.__disabled = new SynchedPropertySimpleOneWayPU(n132.disabled, this, "disabled");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(n132.tooltip, this, "tooltip");
        this.__btnSize = new SynchedPropertySimpleOneWayPU(n132.btnSize, this, "btnSize");
        this.onAction = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.setInitiallyProvidedValue(n132);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(l132: ProteusToolButton_Params) {
        if (l132.iconName === undefined) {
            this.__iconName.set(ProteusIconName.SEARCH);
        }
        if (l132.label === undefined) {
            this.__label.set('');
        }
        if (l132.showLabel === undefined) {
            this.__showLabel.set(true);
        }
        if (l132.active === undefined) {
            this.__active.set(false);
        }
        if (l132.disabled === undefined) {
            this.__disabled.set(false);
        }
        if (l132.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (l132.btnSize === undefined) {
            this.__btnSize.set(24);
        }
        if (l132.onAction !== undefined) {
            this.onAction = l132.onAction;
        }
        if (l132.tipVisible !== undefined) {
            this.tipVisible = l132.tipVisible;
        }
    }
    updateStateVars(k132: ProteusToolButton_Params) {
        this.__iconName.reset(k132.iconName);
        this.__label.reset(k132.label);
        this.__showLabel.reset(k132.showLabel);
        this.__active.reset(k132.active);
        this.__disabled.reset(k132.disabled);
        this.__tooltip.reset(k132.tooltip);
        this.__btnSize.reset(k132.btnSize);
    }
    purgeVariableDependenciesOnElmtId(j132) {
        this.__iconName.purgeDependencyOnElmtId(j132);
        this.__label.purgeDependencyOnElmtId(j132);
        this.__showLabel.purgeDependencyOnElmtId(j132);
        this.__active.purgeDependencyOnElmtId(j132);
        this.__disabled.purgeDependencyOnElmtId(j132);
        this.__tooltip.purgeDependencyOnElmtId(j132);
        this.__btnSize.purgeDependencyOnElmtId(j132);
        this.__tipVisible.purgeDependencyOnElmtId(j132);
    }
    aboutToBeDeleted() {
        this.__iconName.aboutToBeDeleted();
        this.__label.aboutToBeDeleted();
        this.__showLabel.aboutToBeDeleted();
        this.__active.aboutToBeDeleted();
        this.__disabled.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__btnSize.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __iconName: SynchedPropertySimpleOneWayPU<ProteusIconName>;
    get iconName() {
        return this.__iconName.get();
    }
    set iconName(i132: ProteusIconName) {
        this.__iconName.set(i132);
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(h132: ResourceStr) {
        this.__label.set(h132);
    }
    private __showLabel: SynchedPropertySimpleOneWayPU<boolean>;
    get showLabel() {
        return this.__showLabel.get();
    }
    set showLabel(g132: boolean) {
        this.__showLabel.set(g132);
    }
    private __active: SynchedPropertySimpleOneWayPU<boolean>;
    get active() {
        return this.__active.get();
    }
    set active(f132: boolean) {
        this.__active.set(f132);
    }
    private __disabled: SynchedPropertySimpleOneWayPU<boolean>;
    get disabled() {
        return this.__disabled.get();
    }
    set disabled(e132: boolean) {
        this.__disabled.set(e132);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(d132: string) {
        this.__tooltip.set(d132);
    }
    private __btnSize: SynchedPropertySimpleOneWayPU<number>;
    get btnSize() {
        return this.__btnSize.get();
    }
    set btnSize(c132: number) {
        this.__btnSize.set(c132);
    }
    private onAction: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(b132: boolean) {
        this.__tipVisible.set(b132);
    }
    initialRender() {
        this.observeComponentCreation2((x131, y131) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.height(this.btnSize);
            Button.constraintSize({ minWidth: this.showLabel ? 0 : this.btnSize, maxWidth: this.showLabel ? 220 : this.btnSize });
            Button.padding({ left: 3, right: 3 });
            Button.borderRadius(0);
            Button.backgroundColor(this.active ? ProteusColors.TREE_SELECTED :
                (this.disabled ? ProteusColors.INPUT_READONLY_BG : ProteusColors.BTN_BG));
            Button.border({ width: 1, color: this.active ? ProteusColors.BTN_FOCUS : ProteusColors.INPUT_BORDER });
            Button.enabled(!this.disabled);
            Button.onClick(() => {
                if (!this.disabled)
                    this.onAction();
            });
            Button.onHover((a132: boolean) => {
                if (!this.disabled && this.tooltip.length > 0) {
                    this.tipVisible = a132;
                }
            });
            Button.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Top,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (z131) => {
                    if (!z131.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Button);
        this.observeComponentCreation2((v131, w131) => {
            Row.create();
            Row.justifyContent(FlexAlign.Center);
        }, Row);
        {
            this.observeComponentCreation2((r131, s131) => {
                if (s131) {
                    let t131 = new ProteusIcon(this, {
                        name: this.iconName,
                        iconSize: 14,
                        color: this.disabled ? ProteusColors.TEXT_SECONDARY :
                            (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
                    }, undefined, r131, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 460, col: 9 });
                    ViewPU.create(t131);
                    let u131 = () => {
                        return {
                            name: this.iconName,
                            iconSize: 14,
                            color: this.disabled ? ProteusColors.TEXT_SECONDARY :
                                (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
                        };
                    };
                    t131.paramsGenerator_ = u131;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(r131, {
                        name: this.iconName,
                        iconSize: 14,
                        color: this.disabled ? ProteusColors.TEXT_SECONDARY :
                            (this.active ? ProteusColors.BTN_FOCUS : ProteusColors.TEXT_PRIMARY)
                    });
                }
            }, { name: "ProteusIcon" });
        }
        this.observeComponentCreation2((n131, o131) => {
            If.create();
            if (this.showLabel && this.label !== '') {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((p131, q131) => {
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
    tooltipPopup(m131 = null) {
        ProteusTooltipBubble.bind(this)(this.tooltip);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusMenuTrigger extends ViewPU {
    constructor(g131, h131, i131, j131 = -1, k131 = undefined, l131) {
        super(g131, i131, j131, l131);
        if (typeof k131 === "function") {
            this.paramsGenerator_ = k131;
        }
        this.__label = new SynchedPropertyObjectOneWayPU(h131.label, this, "label");
        this.entries = [];
        this.__open = new ObservedPropertySimplePU(false, this, "open");
        this.setInitiallyProvidedValue(h131);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(f131: ProteusMenuTrigger_Params) {
        if (f131.label === undefined) {
            this.__label.set('');
        }
        if (f131.entries !== undefined) {
            this.entries = f131.entries;
        }
        if (f131.open !== undefined) {
            this.open = f131.open;
        }
    }
    updateStateVars(e131: ProteusMenuTrigger_Params) {
        this.__label.reset(e131.label);
    }
    purgeVariableDependenciesOnElmtId(d131) {
        this.__label.purgeDependencyOnElmtId(d131);
        this.__open.purgeDependencyOnElmtId(d131);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__open.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<ResourceStr>;
    get label() {
        return this.__label.get();
    }
    set label(c131: ResourceStr) {
        this.__label.set(c131);
    }
    private entries: ProteusMenuEntry[];
    private __open: ObservedPropertySimplePU<boolean>;
    get open() {
        return this.__open.get();
    }
    set open(b131: boolean) {
        this.__open.set(b131);
    }
    initialRender() {
        this.observeComponentCreation2((z130, a131) => {
            Button.createWithChild({ type: ButtonType.Normal });
            Button.height(ProteusDimens.MENU_HEIGHT);
            Button.padding({ left: 6, right: 4 });
            Button.borderRadius(0);
            Button.backgroundColor(this.open ? ProteusColors.MENU_HOVER : ProteusColors.MENU_BG);
            Button.onClick(() => { this.open = true; });
            Button.bindMenu({ builder: this.buildMenu.bind(this) });
        }, Button);
        this.observeComponentCreation2((x130, y130) => {
            Row.create();
        }, Row);
        this.observeComponentCreation2((v130, w130) => {
            Text.create(this.label);
            Text.fontSize(ProteusFonts.MENU);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t130, u130) => {
            __Common__.create();
            __Common__.margin({ left: 2 });
        }, __Common__);
        {
            this.observeComponentCreation2((p130, q130) => {
                if (q130) {
                    let r130 = new ProteusIcon(this, { name: ProteusIconName.CHEVRON_DOWN, iconSize: 8, color: ProteusColors.TEXT_SECONDARY }, undefined, p130, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 528, col: 9 });
                    ViewPU.create(r130);
                    let s130 = () => {
                        return {
                            name: ProteusIconName.CHEVRON_DOWN,
                            iconSize: 8,
                            color: ProteusColors.TEXT_SECONDARY
                        };
                    };
                    r130.paramsGenerator_ = s130;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(p130, {
                        name: ProteusIconName.CHEVRON_DOWN, iconSize: 8, color: ProteusColors.TEXT_SECONDARY
                    });
                }
            }, { name: "ProteusIcon" });
        }
        __Common__.pop();
        Row.pop();
        Button.pop();
    }
    buildMenu(q129 = null) {
        this.observeComponentCreation2((n130, o130) => {
            Column.create();
            Column.width(220);
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.border({ width: 1, color: ProteusColors.WINDOW_BORDER });
        }, Column);
        this.observeComponentCreation2((r129, s129) => {
            ForEach.create();
            const t129 = (w129, x129: number) => {
                const y129 = w129;
                this.observeComponentCreation2((z129, a130) => {
                    If.create();
                    if (y129.separator) {
                        this.ifElseBranchUpdateFunction(0, () => {
                            this.observeComponentCreation2((l130, m130) => {
                                Divider.create();
                                Divider.color(ProteusColors.DIVIDER);
                                Divider.height(1);
                                Divider.width('100%');
                            }, Divider);
                        });
                    }
                    else {
                        this.ifElseBranchUpdateFunction(1, () => {
                            this.observeComponentCreation2((j130, k130) => {
                                Row.create();
                                Row.width('100%');
                                Row.height(24);
                                Row.padding({ left: 8, right: 8 });
                                Row.alignItems(VerticalAlign.Center);
                                Row.enabled(!y129.disabled);
                                Row.onClick(() => {
                                    if (!y129.disabled) {
                                        this.open = false;
                                        y129.action();
                                    }
                                });
                            }, Row);
                            this.observeComponentCreation2((h130, i130) => {
                                Blank.create();
                                Blank.width(16);
                            }, Blank);
                            Blank.pop();
                            this.observeComponentCreation2((f130, g130) => {
                                Text.create(y129.label);
                                Text.fontSize(ProteusFonts.MENU);
                                Text.fontColor(y129.disabled ? ProteusColors.TEXT_SECONDARY : ProteusColors.TEXT_PRIMARY);
                                Text.layoutWeight(1);
                                Text.maxLines(1);
                                Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((b130, c130) => {
                                If.create();
                                if (y129.shortcut && y129.shortcut.length > 0) {
                                    this.ifElseBranchUpdateFunction(0, () => {
                                        this.observeComponentCreation2((d130, e130) => {
                                            Text.create(y129.shortcut);
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
                        });
                    }
                }, If);
                If.pop();
            };
            this.forEachUpdateFunction(r129, this.entries, t129, (u129: ProteusMenuEntry, v129: number) => `${v129}_${u129.shortcut ?? ''}`, true, true);
        }, ForEach);
        ForEach.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusSidebarTab extends ViewPU {
    constructor(k129, l129, m129, n129 = -1, o129 = undefined, p129) {
        super(k129, m129, n129, p129);
        if (typeof o129 === "function") {
            this.paramsGenerator_ = o129;
        }
        this.__label = new SynchedPropertySimpleOneWayPU(l129.label, this, "label");
        this.__tooltip = new SynchedPropertySimpleOneWayPU(l129.tooltip, this, "tooltip");
        this.__icon = new SynchedPropertySimpleOneWayPU(l129.icon, this, "icon");
        this.__selected = new SynchedPropertySimpleOneWayPU(l129.selected, this, "selected");
        this.onSelect = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.setInitiallyProvidedValue(l129);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(j129: ProteusSidebarTab_Params) {
        if (j129.label === undefined) {
            this.__label.set('');
        }
        if (j129.tooltip === undefined) {
            this.__tooltip.set('');
        }
        if (j129.icon === undefined) {
            this.__icon.set(ProteusIconName.SETTINGS);
        }
        if (j129.selected === undefined) {
            this.__selected.set(false);
        }
        if (j129.onSelect !== undefined) {
            this.onSelect = j129.onSelect;
        }
        if (j129.tipVisible !== undefined) {
            this.tipVisible = j129.tipVisible;
        }
    }
    updateStateVars(i129: ProteusSidebarTab_Params) {
        this.__label.reset(i129.label);
        this.__tooltip.reset(i129.tooltip);
        this.__icon.reset(i129.icon);
        this.__selected.reset(i129.selected);
    }
    purgeVariableDependenciesOnElmtId(h129) {
        this.__label.purgeDependencyOnElmtId(h129);
        this.__tooltip.purgeDependencyOnElmtId(h129);
        this.__icon.purgeDependencyOnElmtId(h129);
        this.__selected.purgeDependencyOnElmtId(h129);
        this.__tipVisible.purgeDependencyOnElmtId(h129);
    }
    aboutToBeDeleted() {
        this.__label.aboutToBeDeleted();
        this.__tooltip.aboutToBeDeleted();
        this.__icon.aboutToBeDeleted();
        this.__selected.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __label: SynchedPropertySimpleOneWayPU<string>;
    get label() {
        return this.__label.get();
    }
    set label(g129: string) {
        this.__label.set(g129);
    }
    private __tooltip: SynchedPropertySimpleOneWayPU<string>;
    get tooltip() {
        return this.__tooltip.get();
    }
    set tooltip(f129: string) {
        this.__tooltip.set(f129);
    }
    private __icon: SynchedPropertySimpleOneWayPU<ProteusIconName>;
    get icon() {
        return this.__icon.get();
    }
    set icon(e129: ProteusIconName) {
        this.__icon.set(e129);
    }
    private __selected: SynchedPropertySimpleOneWayPU<boolean>;
    get selected() {
        return this.__selected.get();
    }
    set selected(d129: boolean) {
        this.__selected.set(d129);
    }
    private onSelect: () => void;
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(c129: boolean) {
        this.__tipVisible.set(c129);
    }
    private tipText(): string {
        return this.tooltip.length > 0 ? this.tooltip : this.label;
    }
    initialRender() {
        this.observeComponentCreation2((y128, z128) => {
            Column.create();
            Column.width(44);
            Column.height(50);
            Column.justifyContent(FlexAlign.Center);
            Column.alignItems(HorizontalAlign.Center);
            Column.backgroundColor(this.selected ?
                ProteusColors.SIDEBAR_TAB_ACTIVE_BG : ProteusColors.SIDEBAR_TAB_IDLE_BG);
            Column.border({
                width: {
                    left: this.selected ? 3 : 0,
                    bottom: 1
                },
                color: this.selected ?
                    ProteusColors.BTN_FOCUS : ProteusColors.SIDEBAR_TAB_BORDER
            });
            Column.onClick(() => { this.onSelect(); });
            Column.onHover((b129: boolean) => {
                if (this.tipText().length > 0) {
                    this.tipVisible = b129;
                }
            });
            Column.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Left,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (a129) => {
                    if (!a129.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
        }, Column);
        {
            this.observeComponentCreation2((u128, v128) => {
                if (v128) {
                    let w128 = new ProteusIcon(this, {
                        name: this.icon,
                        iconSize: 16,
                        color: this.selected ?
                            ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
                    }, undefined, u128, () => { }, { page: "entry/src/main/ets/components/proteus/ProteusWidgets.ets", line: 600, col: 7 });
                    ViewPU.create(w128);
                    let x128 = () => {
                        return {
                            name: this.icon,
                            iconSize: 16,
                            color: this.selected ?
                                ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
                        };
                    };
                    w128.paramsGenerator_ = x128;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(u128, {
                        name: this.icon,
                        iconSize: 16,
                        color: this.selected ?
                            ProteusColors.SIDEBAR_TAB_ACTIVE_TEXT : ProteusColors.SIDEBAR_TAB_IDLE_TEXT
                    });
                }
            }, { name: "ProteusIcon" });
        }
        this.observeComponentCreation2((s128, t128) => {
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
    tooltipPopup(r128 = null) {
        ProteusTooltipBubble.bind(this)(this.tipText());
    }
    rerender() {
        this.updateDirtyElements();
    }
}
export class ProteusToolGroup extends ViewPU {
    constructor(l128, m128, n128, o128 = -1, p128 = undefined, q128) {
        super(l128, n128, o128, q128);
        if (typeof p128 === "function") {
            this.paramsGenerator_ = p128;
        }
        this.__title = new SynchedPropertySimpleOneWayPU(m128.title, this, "title");
        this.content = undefined;
        this.setInitiallyProvidedValue(m128);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(k128: ProteusToolGroup_Params) {
        if (k128.title === undefined) {
            this.__title.set('');
        }
        if (k128.content !== undefined) {
            this.content = k128.content;
        }
    }
    updateStateVars(j128: ProteusToolGroup_Params) {
        this.__title.reset(j128.title);
    }
    purgeVariableDependenciesOnElmtId(i128) {
        this.__title.purgeDependencyOnElmtId(i128);
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
    set title(h128: string) {
        this.__title.set(h128);
    }
    private __content;
    initialRender() {
        this.observeComponentCreation2((f128, g128) => {
            Row.create();
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((d128, e128) => {
            Text.create(this.title);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.height(ProteusDimens.TOOLBAR_HEIGHT);
            Text.align(Alignment.Center);
            Text.margin({ left: 4, right: 2 });
        }, Text);
        Text.pop();
        this.content.bind(this)();
        this.observeComponentCreation2((b128, c128) => {
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
    constructor(v127, w127, x127, y127 = -1, z127 = undefined, a128) {
        super(v127, x127, y127, a128);
        if (typeof z127 === "function") {
            this.paramsGenerator_ = z127;
        }
        this.__side = new SynchedPropertySimpleOneWayPU(w127.side, this, "side");
        this.onDrag = () => { };
        this.__hovered = new ObservedPropertySimplePU(false, this, "hovered");
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.startOffset = 0;
        this.lastOffset = 0;
        this.setInitiallyProvidedValue(w127);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(u127: ProteusResizer_Params) {
        if (u127.side === undefined) {
            this.__side.set('right');
        }
        if (u127.onDrag !== undefined) {
            this.onDrag = u127.onDrag;
        }
        if (u127.hovered !== undefined) {
            this.hovered = u127.hovered;
        }
        if (u127.tipVisible !== undefined) {
            this.tipVisible = u127.tipVisible;
        }
        if (u127.startOffset !== undefined) {
            this.startOffset = u127.startOffset;
        }
        if (u127.lastOffset !== undefined) {
            this.lastOffset = u127.lastOffset;
        }
    }
    updateStateVars(t127: ProteusResizer_Params) {
        this.__side.reset(t127.side);
    }
    purgeVariableDependenciesOnElmtId(s127) {
        this.__side.purgeDependencyOnElmtId(s127);
        this.__hovered.purgeDependencyOnElmtId(s127);
        this.__tipVisible.purgeDependencyOnElmtId(s127);
    }
    aboutToBeDeleted() {
        this.__side.aboutToBeDeleted();
        this.__hovered.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __side: SynchedPropertySimpleOneWayPU<'left' | 'right'>;
    get side() {
        return this.__side.get();
    }
    set side(r127: 'left' | 'right') {
        this.__side.set(r127);
    }
    private onDrag: (delta: number) => void;
    private __hovered: ObservedPropertySimplePU<boolean>;
    get hovered() {
        return this.__hovered.get();
    }
    set hovered(q127: boolean) {
        this.__hovered.set(q127);
    }
    private __tipVisible: ObservedPropertySimplePU<boolean>;
    get tipVisible() {
        return this.__tipVisible.get();
    }
    set tipVisible(p127: boolean) {
        this.__tipVisible.set(p127);
    }
    private startOffset: number;
    private lastOffset: number;
    initialRender() {
        this.observeComponentCreation2((h127, i127) => {
            Column.create();
            Column.width(4);
            Column.height('100%');
            Column.backgroundColor(this.hovered ? ProteusColors.BTN_FOCUS : ProteusColors.DIVIDER);
            Column.onHover((o127: boolean) => {
                this.hovered = o127;
                this.tipVisible = o127;
            });
            Column.bindPopup(this.tipVisible, {
                builder: { builder: this.resizerTip.bind(this) },
                placement: this.side === 'right' ? Placement.Left : Placement.Right,
                enableArrow: true,
                popupColor: Color.Transparent,
                mask: false,
                onStateChange: (n127) => {
                    if (!n127.isVisible) {
                        this.tipVisible = false;
                    }
                }
            });
            globalThis.Gesture.create(GesturePriority.Low);
            PanGesture.create();
            PanGesture.onActionStart((m127: GestureEvent) => {
                this.startOffset = m127.offsetX;
                this.lastOffset = m127.offsetX;
            });
            PanGesture.onActionUpdate((j127: GestureEvent) => {
                const k127 = j127.offsetX - this.lastOffset;
                this.lastOffset = j127.offsetX;
                const l127 = this.side === 'right' ? -k127 : k127;
                this.onDrag(l127);
            });
            PanGesture.pop();
            globalThis.Gesture.pop();
            Column.hitTestBehavior(HitTestMode.Block);
        }, Column);
        Column.pop();
    }
    resizerTip(g127 = null) {
        ProteusTooltipBubble.bind(this)('拖动调整面板宽度');
    }
    rerender() {
        this.updateDirtyElements();
    }
}
