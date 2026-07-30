if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface PcbStatusBar_Params {
    themeRev?: number;
    statusMessage?: string;
    worldX?: number;
    worldY?: number;
    zoomPercent?: number;
    activeLayer?: PcbLayerId;
    gridSize?: number;
    gridVisible?: boolean;
    hoverNetName?: string;
}
import { PcbLayerId } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { appVersionLabel } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { PROTEUS_THEME_REV_KEY } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ThemeManager";
export class PcbStatusBar extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__themeRev = this.createStorageProp(PROTEUS_THEME_REV_KEY, 0, "themeRev");
        this.__statusMessage = new SynchedPropertySimpleOneWayPU(params.statusMessage, this, "statusMessage");
        this.__worldX = new SynchedPropertySimpleOneWayPU(params.worldX, this, "worldX");
        this.__worldY = new SynchedPropertySimpleOneWayPU(params.worldY, this, "worldY");
        this.__zoomPercent = new SynchedPropertySimpleOneWayPU(params.zoomPercent, this, "zoomPercent");
        this.__activeLayer = new SynchedPropertySimpleOneWayPU(params.activeLayer, this, "activeLayer");
        this.__gridSize = new SynchedPropertySimpleOneWayPU(params.gridSize, this, "gridSize");
        this.__gridVisible = new SynchedPropertySimpleOneWayPU(params.gridVisible, this, "gridVisible");
        this.__hoverNetName = new SynchedPropertySimpleOneWayPU(params.hoverNetName, this, "hoverNetName");
        this.setInitiallyProvidedValue(params);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: PcbStatusBar_Params) {
        if (params.statusMessage === undefined) {
            this.__statusMessage.set('');
        }
        if (params.worldX === undefined) {
            this.__worldX.set(0);
        }
        if (params.worldY === undefined) {
            this.__worldY.set(0);
        }
        if (params.zoomPercent === undefined) {
            this.__zoomPercent.set(100);
        }
        if (params.activeLayer === undefined) {
            this.__activeLayer.set(PcbLayerId.F_CU);
        }
        if (params.gridSize === undefined) {
            this.__gridSize.set(5);
        }
        if (params.gridVisible === undefined) {
            this.__gridVisible.set(true);
        }
        if (params.hoverNetName === undefined) {
            this.__hoverNetName.set('');
        }
    }
    updateStateVars(params: PcbStatusBar_Params) {
        this.__statusMessage.reset(params.statusMessage);
        this.__worldX.reset(params.worldX);
        this.__worldY.reset(params.worldY);
        this.__zoomPercent.reset(params.zoomPercent);
        this.__activeLayer.reset(params.activeLayer);
        this.__gridSize.reset(params.gridSize);
        this.__gridVisible.reset(params.gridVisible);
        this.__hoverNetName.reset(params.hoverNetName);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__themeRev.purgeDependencyOnElmtId(rmElmtId);
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__worldX.purgeDependencyOnElmtId(rmElmtId);
        this.__worldY.purgeDependencyOnElmtId(rmElmtId);
        this.__zoomPercent.purgeDependencyOnElmtId(rmElmtId);
        this.__activeLayer.purgeDependencyOnElmtId(rmElmtId);
        this.__gridSize.purgeDependencyOnElmtId(rmElmtId);
        this.__gridVisible.purgeDependencyOnElmtId(rmElmtId);
        this.__hoverNetName.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__themeRev.aboutToBeDeleted();
        this.__statusMessage.aboutToBeDeleted();
        this.__worldX.aboutToBeDeleted();
        this.__worldY.aboutToBeDeleted();
        this.__zoomPercent.aboutToBeDeleted();
        this.__activeLayer.aboutToBeDeleted();
        this.__gridSize.aboutToBeDeleted();
        this.__gridVisible.aboutToBeDeleted();
        this.__hoverNetName.aboutToBeDeleted();
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
    private __statusMessage: SynchedPropertySimpleOneWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __worldX: SynchedPropertySimpleOneWayPU<number>;
    get worldX() {
        return this.__worldX.get();
    }
    set worldX(newValue: number) {
        this.__worldX.set(newValue);
    }
    private __worldY: SynchedPropertySimpleOneWayPU<number>;
    get worldY() {
        return this.__worldY.get();
    }
    set worldY(newValue: number) {
        this.__worldY.set(newValue);
    }
    private __zoomPercent: SynchedPropertySimpleOneWayPU<number>;
    get zoomPercent() {
        return this.__zoomPercent.get();
    }
    set zoomPercent(newValue: number) {
        this.__zoomPercent.set(newValue);
    }
    private __activeLayer: SynchedPropertySimpleOneWayPU<PcbLayerId>;
    get activeLayer() {
        return this.__activeLayer.get();
    }
    set activeLayer(newValue: PcbLayerId) {
        this.__activeLayer.set(newValue);
    }
    private __gridSize: SynchedPropertySimpleOneWayPU<number>;
    get gridSize() {
        return this.__gridSize.get();
    }
    set gridSize(newValue: number) {
        this.__gridSize.set(newValue);
    }
    private __gridVisible: SynchedPropertySimpleOneWayPU<boolean>;
    get gridVisible() {
        return this.__gridVisible.get();
    }
    set gridVisible(newValue: boolean) {
        this.__gridVisible.set(newValue);
    }
    private __hoverNetName: SynchedPropertySimpleOneWayPU<string>;
    get hoverNetName() {
        return this.__hoverNetName.get();
    }
    set hoverNetName(newValue: string) {
        this.__hoverNetName.set(newValue);
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.height(ProteusDimens.STATUS_HEIGHT);
            Row.backgroundColor(ProteusColors.STATUS_BAR_BG);
            Row.border({ width: { top: 1 }, color: ProteusColors.BORDER });
            Row.alignItems(VerticalAlign.Center);
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 状态消息
            Text.create(this.statusMessage);
            // 状态消息
            Text.fontSize(ProteusFonts.STATUS);
            // 状态消息
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            // 状态消息
            Text.layoutWeight(2);
            // 状态消息
            Text.maxLines(1);
            // 状态消息
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
            // 状态消息
            Text.margin({ left: 8 });
        }, Text);
        // 状态消息
        Text.pop();
        this.sep.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 坐标
            Text.create(`X ${this.worldX.toFixed(1)}  Y ${this.worldY.toFixed(1)} mil`);
            // 坐标
            Text.fontSize(ProteusFonts.STATUS);
            // 坐标
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            // 坐标
            Text.fontFamily('monospace');
        }, Text);
        // 坐标
        Text.pop();
        this.sep.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 悬停网络
            Text.create(this.hoverNetName.length > 0 ? `Net ${this.hoverNetName}` : 'Net —');
            // 悬停网络
            Text.fontSize(ProteusFonts.STATUS);
            // 悬停网络
            Text.fontColor(this.hoverNetName.length > 0 ? ProteusColors.SELECTED : ProteusColors.TEXT_SECONDARY);
            // 悬停网络
            Text.fontFamily('monospace');
        }, Text);
        // 悬停网络
        Text.pop();
        this.sep.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 网格
            Text.create(this.gridVisible ? `Grid ${this.gridSize} mil` : 'Grid off');
            // 网格
            Text.fontSize(ProteusFonts.STATUS);
            // 网格
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
        }, Text);
        // 网格
        Text.pop();
        this.sep.bind(this)();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 活动层
            Text.create(this.activeLayer);
            // 活动层
            Text.fontSize(ProteusFonts.STATUS);
            // 活动层
            Text.fontColor(ProteusColors.SELECTED);
            // 活动层
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        // 活动层
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 缩放
            Text.create(`${this.zoomPercent}%`);
            // 缩放
            Text.fontSize(ProteusFonts.STATUS);
            // 缩放
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            // 缩放
            Text.fontWeight(FontWeight.Medium);
            // 缩放
            Text.margin({ right: 12 });
        }, Text);
        // 缩放
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(appVersionLabel());
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.margin({ right: 8 });
        }, Text);
        Text.pop();
        Row.pop();
    }
    sep(parent = null) {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('|');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(ProteusColors.DIVIDER);
            Text.margin({ left: 8, right: 8 });
        }, Text);
        Text.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
