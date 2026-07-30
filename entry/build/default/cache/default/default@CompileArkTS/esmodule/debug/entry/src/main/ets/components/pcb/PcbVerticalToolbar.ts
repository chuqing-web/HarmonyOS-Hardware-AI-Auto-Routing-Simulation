if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbVerticalToolbar_Params {
    themeRev?: number;
    toolMode?: PcbToolMode;
    gridActive?: boolean;
    onToolSelect?: (mode: PcbToolMode) => void;
    onRotate?: () => void;
    onFlip?: () => void;
    onDelete?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onFit?: () => void;
    onToggleGrid?: () => void;
    onUpdatePcb?: () => void;
    onDrc?: () => void;
    onAutoRoute?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
}
import { PcbToolMode } from "@bundle:com.elecdraw.aischsim/entry@pcb_editor/Index";
import { ProteusColors } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
import { ProteusIconName } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusIcons";
import { ProteusToolButton } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
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
        this.onFlip = () => { };
        this.onDelete = () => { };
        this.onUndo = () => { };
        this.onRedo = () => { };
        this.onFit = () => { };
        this.onToggleGrid = () => { };
        this.onUpdatePcb = () => { };
        this.onDrc = () => { };
        this.onAutoRoute = () => { };
        this.onCopy = () => { };
        this.onPaste = () => { };
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
        if (params.onFlip !== undefined) {
            this.onFlip = params.onFlip;
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
        if (params.onCopy !== undefined) {
            this.onCopy = params.onCopy;
        }
        if (params.onPaste !== undefined) {
            this.onPaste = params.onPaste;
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
    private onFlip: () => void;
    private onDelete: () => void;
    private onUndo: () => void;
    private onRedo: () => void;
    private onFit: () => void;
    private onToggleGrid: () => void;
    private onUpdatePcb: () => void;
    private onDrc: () => void;
    private onAutoRoute: () => void;
    private onCopy: () => void;
    private onPaste: () => void;
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width(44);
            Scroll.height('100%');
            Scroll.scrollBar(BarState.Auto);
            Scroll.backgroundColor(ProteusColors.TOOLBAR_BG);
            Scroll.border({ width: { right: 1 }, color: ProteusColors.BORDER });
            Scroll.hitTestBehavior(HitTestMode.Default);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.padding({ top: 4, bottom: 8 });
            Column.alignItems(HorizontalAlign.Center);
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.SELECT,
                        tooltip: '选择 (S)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.SELECT,
                        onAction: () => { this.onToolSelect(PcbToolMode.SELECT); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 32, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.SELECT,
                            tooltip: '选择 (S)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.SELECT,
                            onAction: () => { this.onToolSelect(PcbToolMode.SELECT); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.SELECT,
                        tooltip: '选择 (S)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.SELECT
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.TRACK,
                        tooltip: '走线 (X)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.ROUTE,
                        onAction: () => { this.onToolSelect(PcbToolMode.ROUTE); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 40, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.TRACK,
                            tooltip: '走线 (X)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.ROUTE,
                            onAction: () => { this.onToolSelect(PcbToolMode.ROUTE); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.TRACK,
                        tooltip: '走线 (X)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.ROUTE
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.VIA,
                        tooltip: '过孔 (V)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.VIA,
                        onAction: () => { this.onToolSelect(PcbToolMode.VIA); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 48, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.VIA,
                            tooltip: '过孔 (V)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.VIA,
                            onAction: () => { this.onToolSelect(PcbToolMode.VIA); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.VIA,
                        tooltip: '过孔 (V)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.VIA
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.ZONE,
                        tooltip: '多边形覆铜 (Z)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.ZONE_POLY,
                        onAction: () => { this.onToolSelect(PcbToolMode.ZONE_POLY); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 56, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.ZONE,
                            tooltip: '多边形覆铜 (Z)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.ZONE_POLY,
                            onAction: () => { this.onToolSelect(PcbToolMode.ZONE_POLY); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.ZONE,
                        tooltip: '多边形覆铜 (Z)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.ZONE_POLY
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.GROUND,
                        tooltip: '整板覆铜 (Shift+Z)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.POUR,
                        onAction: () => { this.onToolSelect(PcbToolMode.POUR); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 64, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.GROUND,
                            tooltip: '整板覆铜 (Shift+Z)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.POUR,
                            onAction: () => { this.onToolSelect(PcbToolMode.POUR); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.GROUND,
                        tooltip: '整板覆铜 (Shift+Z)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.POUR
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.LABEL,
                        tooltip: '板框 (O)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.OUTLINE,
                        onAction: () => { this.onToolSelect(PcbToolMode.OUTLINE); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 72, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.LABEL,
                            tooltip: '板框 (O)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.OUTLINE,
                            onAction: () => { this.onToolSelect(PcbToolMode.OUTLINE); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.LABEL,
                        tooltip: '板框 (O)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.OUTLINE
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.RULER,
                        tooltip: '测量 (M)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.MEASURE,
                        onAction: () => { this.onToolSelect(PcbToolMode.MEASURE); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 80, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.RULER,
                            tooltip: '测量 (M)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.MEASURE,
                            onAction: () => { this.onToolSelect(PcbToolMode.MEASURE); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.RULER,
                        tooltip: '测量 (M)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.MEASURE
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.COMPONENT,
                        tooltip: '放置封装 (P)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.PLACE_FP,
                        onAction: () => { this.onToolSelect(PcbToolMode.PLACE_FP); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 88, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.COMPONENT,
                            tooltip: '放置封装 (P)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.toolMode === PcbToolMode.PLACE_FP,
                            onAction: () => { this.onToolSelect(PcbToolMode.PLACE_FP); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.COMPONENT,
                        tooltip: '放置封装 (P)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.toolMode === PcbToolMode.PLACE_FP
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.width('80%');
            Divider.margin({ top: 4, bottom: 4 });
        }, Divider);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.ROTATE,
                        tooltip: '旋转 (R)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onRotate(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 99, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.ROTATE,
                            tooltip: '旋转 (R)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onRotate(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.ROTATE,
                        tooltip: '旋转 (R)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.MIRROR,
                        tooltip: '镜像翻转 (F)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onFlip(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 106, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.MIRROR,
                            tooltip: '镜像翻转 (F)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onFlip(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.MIRROR,
                        tooltip: '镜像翻转 (F)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.TRASH,
                        tooltip: '删除 (Del)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onDelete(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 113, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.TRASH,
                            tooltip: '删除 (Del)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onDelete(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.TRASH,
                        tooltip: '删除 (Del)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.UNDO,
                        tooltip: '撤销 (Ctrl+Z)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onUndo(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 120, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.UNDO,
                            tooltip: '撤销 (Ctrl+Z)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onUndo(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.UNDO,
                        tooltip: '撤销 (Ctrl+Z)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.REDO,
                        tooltip: '重做 (Ctrl+Y)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onRedo(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 127, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.REDO,
                            tooltip: '重做 (Ctrl+Y)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onRedo(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.REDO,
                        tooltip: '重做 (Ctrl+Y)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.COPY,
                        tooltip: '复制 (Ctrl+C)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onCopy(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 134, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.COPY,
                            tooltip: '复制 (Ctrl+C)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onCopy(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.COPY,
                        tooltip: '复制 (Ctrl+C)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.PASTE,
                        tooltip: '粘贴 (Ctrl+V)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onPaste(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 141, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.PASTE,
                            tooltip: '粘贴 (Ctrl+V)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onPaste(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.PASTE,
                        tooltip: '粘贴 (Ctrl+V)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.width('80%');
            Divider.margin({ top: 4, bottom: 4 });
        }, Divider);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.FIT,
                        tooltip: '适应窗口 (Ctrl+0)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onFit(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 151, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.FIT,
                            tooltip: '适应窗口 (Ctrl+0)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onFit(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.FIT,
                        tooltip: '适应窗口 (Ctrl+0)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.GRID,
                        tooltip: '切换网格 (G)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.gridActive,
                        onAction: () => { this.onToggleGrid(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 158, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.GRID,
                            tooltip: '切换网格 (G)',
                            showLabel: false,
                            btnSize: 32,
                            active: this.gridActive,
                            onAction: () => { this.onToggleGrid(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.GRID,
                        tooltip: '切换网格 (G)',
                        showLabel: false,
                        btnSize: 32,
                        active: this.gridActive
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.AI_LAYOUT,
                        tooltip: '更新 PCB (U)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onUpdatePcb(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 166, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.AI_LAYOUT,
                            tooltip: '更新 PCB (U)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onUpdatePcb(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.AI_LAYOUT,
                        tooltip: '更新 PCB (U)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.DRC,
                        tooltip: 'DRC 检查 (F7)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onDrc(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 173, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.DRC,
                            tooltip: 'DRC 检查 (F7)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onDrc(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.DRC,
                        tooltip: 'DRC 检查 (F7)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusToolButton(this, {
                        iconName: ProteusIconName.AI_ROUTE,
                        tooltip: '自动布线 (F8)',
                        showLabel: false,
                        btnSize: 32,
                        onAction: () => { this.onAutoRoute(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/pcb/PcbVerticalToolbar.ets", line: 180, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            iconName: ProteusIconName.AI_ROUTE,
                            tooltip: '自动布线 (F8)',
                            showLabel: false,
                            btnSize: 32,
                            onAction: () => { this.onAutoRoute(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        iconName: ProteusIconName.AI_ROUTE,
                        tooltip: '自动布线 (F8)',
                        showLabel: false,
                        btnSize: 32
                    });
                }
            }, { name: "ProteusToolButton" });
        }
        Column.pop();
        Scroll.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
