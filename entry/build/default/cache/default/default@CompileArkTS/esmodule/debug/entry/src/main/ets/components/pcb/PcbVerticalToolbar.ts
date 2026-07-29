if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbToolIconBtn_Params {
    themeRev?: number;
    icon?: ProteusIconName;
    tip?: string;
    active?: boolean;
    onAction?: () => void;
    tipVisible?: boolean;
    pressed?: boolean;
}
interface PcbVerticalToolbar_Params {
    themeRev?: number;
    toolMode?: PcbToolMode;
    gridActive?: boolean;
    onToolSelect?: (mode: PcbToolMode) => void;
    onRotate?: () => void;
    onDelete?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onFit?: () => void;
    onToggleGrid?: () => void;
    onUpdatePcb?: () => void;
    onDrc?: () => void;
    onAutoRoute?: () => void;
}
import { PcbToolMode } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import { ProteusColors, ProteusDimens } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusIcon, ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusTooltipBubble } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
export class PcbVerticalToolbar extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__toolMode = new SynchedPropertySimpleOneWayPU(params.toolMode, this, "toolMode");
        this.__gridActive = new SynchedPropertySimpleOneWayPU(params.gridActive, this, "gridActive");
        this.onToolSelect = (_m: PcbToolMode) => { };
        this.onRotate = () => { };
        this.onDelete = () => { };
        this.onUndo = () => { };
        this.onRedo = () => { };
        this.onFit = () => { };
        this.onToggleGrid = () => { };
        this.onUpdatePcb = () => { };
        this.onDrc = () => { };
        this.onAutoRoute = () => { };
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbVerticalToolbar_Params) {
        if (params.toolMode === undefined) {
            this.__toolMode.set(PcbToolMode.SELECT);
        }
        if (params.gridActive === undefined) {
            this.__gridActive.set(true);
        }
        if (params.onToolSelect !== undefined) {
            this.onToolSelect = params.onToolSelect;
        }
        if (params.onRotate !== undefined) {
            this.onRotate = params.onRotate;
        }
        if (params.onDelete !== undefined) {
            this.onDelete = params.onDelete;
        }
        if (params.onUndo !== undefined) {
            this.onUndo = params.onUndo;
        }
        if (params.onRedo !== undefined) {
            this.onRedo = params.onRedo;
        }
        if (params.onFit !== undefined) {
            this.onFit = params.onFit;
        }
        if (params.onToggleGrid !== undefined) {
            this.onToggleGrid = params.onToggleGrid;
        }
        if (params.onUpdatePcb !== undefined) {
            this.onUpdatePcb = params.onUpdatePcb;
        }
        if (params.onDrc !== undefined) {
            this.onDrc = params.onDrc;
        }
        if (params.onAutoRoute !== undefined) {
            this.onAutoRoute = params.onAutoRoute;
        }
    }
    updateStateVars(params: PcbVerticalToolbar_Params) {
        this.__toolMode.reset(params.toolMode);
        this.__gridActive.reset(params.gridActive);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__toolMode.purgeDependencyOnElmtId(rmElmtId);
        this.__gridActive.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__toolMode.aboutToBeDeleted();
        this.__gridActive.aboutToBeDeleted();
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
    private __toolMode: SynchedPropertySimpleOneWayPU<PcbToolMode>;
    get toolMode() {
        return this.__toolMode.get();
    }
    set toolMode(newValue: PcbToolMode) {
        this.__toolMode.set(newValue);
    }
    private __gridActive: SynchedPropertySimpleOneWayPU<boolean>;
    get gridActive() {
        return this.__gridActive.get();
    }
    set gridActive(newValue: boolean) {
        this.__gridActive.set(newValue);
    }
    private onToolSelect: (mode: PcbToolMode) => void;
    private onRotate: () => void;
    private onDelete: () => void;
    private onUndo: () => void;
    private onRedo: () => void;
    private onFit: () => void;
    private onToggleGrid: () => void;
    private onUpdatePcb: () => void;
    private onDrc: () => void;
    private onAutoRoute: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(44);
            Column.height('100%');
            Column.padding({ top: 4, bottom: 4 });
            Column.backgroundColor(ProteusColors.TOOLBAR_BG);
            Column.border({ width: { right: 1 }, color: ProteusColors.BORDER });
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        this.toolBtn.bind(this)(ProteusIconName.SELECT, '选择 (S)', this.toolMode === PcbToolMode.SELECT, () => {
            this.onToolSelect(PcbToolMode.SELECT);
        });
        this.toolBtn.bind(this)(ProteusIconName.TRACK, '走线 (X)', this.toolMode === PcbToolMode.ROUTE, () => {
            this.onToolSelect(PcbToolMode.ROUTE);
        });
        this.toolBtn.bind(this)(ProteusIconName.VIA, '过孔 (V)', this.toolMode === PcbToolMode.VIA, () => {
            this.onToolSelect(PcbToolMode.VIA);
        });
        this.toolBtn.bind(this)(ProteusIconName.ZONE, '覆铜 (Z)', this.toolMode === PcbToolMode.POUR, () => {
            this.onToolSelect(PcbToolMode.POUR);
        });
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.width('80%');
            Divider.margin({ top: 4, bottom: 4 });
        }, Divider);
        this.toolBtn.bind(this)(ProteusIconName.ROTATE, '旋转 (R)', false, () => { this.onRotate(); });
        this.toolBtn.bind(this)(ProteusIconName.TRASH, '删除 (Del)', false, () => { this.onDelete(); });
        this.toolBtn.bind(this)(ProteusIconName.UNDO, '撤销 (Ctrl+Z)', false, () => { this.onUndo(); });
        this.toolBtn.bind(this)(ProteusIconName.REDO, '重做 (Ctrl+Y)', false, () => { this.onRedo(); });
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.width('80%');
            Divider.margin({ top: 4, bottom: 4 });
        }, Divider);
        this.toolBtn.bind(this)(ProteusIconName.FIT, '适应窗口 (F)', false, () => { this.onFit(); });
        this.toolBtn.bind(this)(ProteusIconName.GRID, '切换网格', this.gridActive, () => { this.onToggleGrid(); });
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.toolBtn.bind(this)(ProteusIconName.COMPONENT, '更新 PCB', false, () => { this.onUpdatePcb(); });
        this.toolBtn.bind(this)(ProteusIconName.DRC, 'DRC 检查', false, () => { this.onDrc(); });
        this.toolBtn.bind(this)(ProteusIconName.AI_ROUTE, '自动布线', false, () => { this.onAutoRoute(); });
        Column.pop();
    }
    toolBtn(icon: ProteusIconName, tip: string, active: boolean, action: () => void, parent = null) {
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new PcbToolIconBtn(this, { icon: icon, tip: tip, active: active, onAction: action }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 69, col: 5 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            icon: icon,
                            tip: tip,
                            active: active,
                            onAction: action
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        icon: icon, tip: tip, active: active
                    });
                }
            }, { name: "PcbToolIconBtn" });
        }
    }
    rerender() {
        this.updateDirtyElements();
    }
}
class PcbToolIconBtn extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__icon = new SynchedPropertySimpleOneWayPU(params.icon, this, "icon");
        this.__tip = new SynchedPropertySimpleOneWayPU(params.tip, this, "tip");
        this.__active = new SynchedPropertySimpleOneWayPU(params.active, this, "active");
        this.onAction = () => { };
        this.__tipVisible = new ObservedPropertySimplePU(false, this, "tipVisible");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbToolIconBtn_Params) {
        if (params.icon === undefined) {
            this.__icon.set(ProteusIconName.SELECT);
        }
        if (params.tip === undefined) {
            this.__tip.set('');
        }
        if (params.active === undefined) {
            this.__active.set(false);
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
    updateStateVars(params: PcbToolIconBtn_Params) {
        this.__icon.reset(params.icon);
        this.__tip.reset(params.tip);
        this.__active.reset(params.active);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__icon.purgeDependencyOnElmtId(rmElmtId);
        this.__tip.purgeDependencyOnElmtId(rmElmtId);
        this.__active.purgeDependencyOnElmtId(rmElmtId);
        this.__tipVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__icon.aboutToBeDeleted();
        this.__tip.aboutToBeDeleted();
        this.__active.aboutToBeDeleted();
        this.__tipVisible.aboutToBeDeleted();
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
    private __icon: SynchedPropertySimpleOneWayPU<ProteusIconName>;
    get icon() {
        return this.__icon.get();
    }
    set icon(newValue: ProteusIconName) {
        this.__icon.set(newValue);
    }
    private __tip: SynchedPropertySimpleOneWayPU<string>;
    get tip() {
        return this.__tip.get();
    }
    set tip(newValue: string) {
        this.__tip.set(newValue);
    }
    private __active: SynchedPropertySimpleOneWayPU<boolean>;
    get active() {
        return this.__active.get();
    }
    set active(newValue: boolean) {
        this.__active.set(newValue);
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
        if (this.pressed) {
            return ProteusColors.BTN_PRESSED;
        }
        return this.active ? ProteusColors.TOOL_ACTIVE : '#00000000';
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width(36);
            Column.height(36);
            Column.justifyContent(FlexAlign.Center);
            Column.backgroundColor(this.bg());
            Column.border({
                width: this.active ? 1 : 0,
                color: this.active ? ProteusColors.SELECTED : Color.Transparent
            });
            Column.margin({ bottom: 2 });
            Column.onClick(() => { this.onAction(); });
            Column.onTouch((event: TouchEvent) => {
                if (event.type === TouchType.Down) {
                    this.pressed = true;
                }
                else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
                    this.pressed = false;
                }
            });
            Column.onHover((hover: boolean) => {
                this.tipVisible = hover;
            });
            Column.bindPopup(this.tipVisible, {
                builder: { builder: this.tooltipPopup.bind(this) },
                placement: Placement.Right,
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
                        iconSize: ProteusDimens.ICON_SIZE,
                        color: this.active ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 92, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            name: this.icon,
                            iconSize: ProteusDimens.ICON_SIZE,
                            color: this.active ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        name: this.icon,
                        iconSize: ProteusDimens.ICON_SIZE,
                        color: this.active ? ProteusColors.SELECTED : ProteusColors.TEXT_PRIMARY
                    });
                }
            }, { name: "ProteusIcon" });
        }
        Column.pop();
    }
    tooltipPopup(parent = null) {
        ProteusTooltipBubble.bind(this)(this.tip);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
