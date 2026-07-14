if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface ComponentPreview_Params {
    libraryId?: string;
    previewVersion?: number;
    pressed?: boolean;
    settings?: RenderingContextSettings;
    context?: CanvasRenderingContext2D;
    appService?: AppService;
    canvasW?: number;
    canvasH?: number;
}
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import type { ComponentLibraryImpl } from 'component_library';
import { SchematicSymbolRenderer } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/SchematicSymbolRenderer";
import { ProteusColors, ProteusDimens, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
import { calcSymbolBounds } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentDefinition } from 'component_library';
export class ComponentPreview extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__libraryId = new SynchedPropertySimpleOneWayPU(params.libraryId, this, "libraryId");
        this.__previewVersion = new ObservedPropertySimplePU(0, this, "previewVersion");
        this.__pressed = new ObservedPropertySimplePU(false, this, "pressed");
        this.settings = new RenderingContextSettings(true);
        this.context = new CanvasRenderingContext2D(this.settings);
        this.appService = AppService.getInstance();
        this.canvasW = 200;
        this.canvasH = ProteusDimens.PREVIEW_HEIGHT - 28;
        this.setInitiallyProvidedValue(params);
        this.declareWatch("libraryId", this.onLibraryIdChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: ComponentPreview_Params) {
        if (params.libraryId === undefined) {
            this.__libraryId.set('');
        }
        if (params.previewVersion !== undefined) {
            this.previewVersion = params.previewVersion;
        }
        if (params.pressed !== undefined) {
            this.pressed = params.pressed;
        }
        if (params.settings !== undefined) {
            this.settings = params.settings;
        }
        if (params.context !== undefined) {
            this.context = params.context;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
        if (params.canvasW !== undefined) {
            this.canvasW = params.canvasW;
        }
        if (params.canvasH !== undefined) {
            this.canvasH = params.canvasH;
        }
    }
    updateStateVars(params: ComponentPreview_Params) {
        this.__libraryId.reset(params.libraryId);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__libraryId.purgeDependencyOnElmtId(rmElmtId);
        this.__previewVersion.purgeDependencyOnElmtId(rmElmtId);
        this.__pressed.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__libraryId.aboutToBeDeleted();
        this.__previewVersion.aboutToBeDeleted();
        this.__pressed.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __libraryId: SynchedPropertySimpleOneWayPU<string>;
    get libraryId() {
        return this.__libraryId.get();
    }
    set libraryId(newValue: string) {
        this.__libraryId.set(newValue);
    }
    private __previewVersion: ObservedPropertySimplePU<number>;
    get previewVersion() {
        return this.__previewVersion.get();
    }
    set previewVersion(newValue: number) {
        this.__previewVersion.set(newValue);
    }
    private __pressed: ObservedPropertySimplePU<boolean>;
    get pressed() {
        return this.__pressed.get();
    }
    set pressed(newValue: boolean) {
        this.__pressed.set(newValue);
    }
    private settings: RenderingContextSettings;
    private context: CanvasRenderingContext2D;
    private appService: AppService;
    private canvasW: number;
    private canvasH: number;
    onLibraryIdChange(): void {
        this.previewVersion++;
        this.redraw();
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.height(ProteusDimens.PREVIEW_HEIGHT);
            Column.backgroundColor(this.pressed ? ProteusColors.BTN_PRESSED : ProteusColors.PREVIEW_BG);
            Column.justifyContent(FlexAlign.Center);
            Column.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
            Column.scale(this.pressed ? { x: 0.98, y: 0.98 } : { x: 1, y: 1 });
            Column.opacity(this.pressed ? 0.88 : 1);
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
            Canvas.create(this.context);
            Canvas.width('100%');
            Canvas.height(ProteusDimens.PREVIEW_HEIGHT - 28);
            Canvas.backgroundColor(ProteusColors.PREVIEW_BG);
            Canvas.border({ width: 1, color: ProteusColors.DIVIDER, style: BorderStyle.Solid });
            Canvas.onReady(() => this.redraw());
            Canvas.onAreaChange((_old, area) => {
                this.canvasW = area.width as number;
                this.canvasH = area.height as number;
                this.redraw();
            });
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.libraryId || '—');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        Column.pop();
    }
    private redraw(): void {
        const ctx = this.context;
        const w = this.canvasW;
        const h = this.canvasH;
        if (w <= 0 || h <= 0) {
            return;
        }
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = ProteusColors.PREVIEW_BG;
        ctx.fillRect(0, 0, w, h);
        if (this.libraryId.length === 0) {
            ctx.fillStyle = ProteusColors.TEXT_LABEL;
            ctx.font = `${ProteusFonts.STATUS}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('器件预览', w / 2, h / 2);
            ctx.textAlign = 'start';
            return;
        }
        const lib = this.appService.componentLibrary as ComponentLibraryImpl;
        const resolvedId = lib.resolveLibraryId(this.libraryId);
        const defResult = lib.getComponent(resolvedId);
        if (!defResult.success || !defResult.data) {
            ctx.fillStyle = ProteusColors.TEXT_LABEL;
            ctx.font = `${ProteusFonts.STATUS}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(this.libraryId, w / 2, h / 2);
            ctx.textAlign = 'start';
            return;
        }
        const def = defResult.data;
        // Auto-scale to fit the component within the preview
        const margin = 16;
        const availW = w - margin * 2;
        const availH = h - margin * 2;
        let symbolW = 60;
        let symbolH = 40;
        if (def.pins.length > 0) {
            const bounds = calcSymbolBounds(def.pins, 10);
            symbolW = Math.max(60, bounds.width + 16);
            symbolH = Math.max(40, bounds.height + 16);
        }
        const scaleX = availW / symbolW;
        const scaleY = availH / symbolH;
        const scale = Math.min(scaleX, scaleY, 1.2);
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        // Draw body backdrop so every component has a visible border boundary,
        // matching the canvas rendering (drawComponentBodyBackdrop)
        this.drawPreviewBackdrop(ctx, def);
        SchematicSymbolRenderer.drawComponent(ctx, 0, 0, def, 'REF', 0, false, {
            strokeColor: ProteusColors.COMPONENT_STROKE,
            fillColor: ProteusColors.PREVIEW_BG,
            lineWidth: 1.2 / scale,
            selected: false,
            hovered: false
        });
        ctx.restore();
    }
    /**
     * Draws the component body filled rectangle as backdrop, same as
     * drawComponentBodyBackdrop on the main canvas. This ensures every
     * component preview shows a visible body border.
     */
    private drawPreviewBackdrop(ctx: CanvasRenderingContext2D, def: ComponentDefinition): void {
        if (def.pins.length === 0) {
            return;
        }
        const pinBounds = calcSymbolBounds(def.pins, 0);
        // Skip small 2-pin components (resistors, capacitors, etc.) — same threshold as canvas
        if (pinBounds.width < 50 || pinBounds.height < 40) {
            return;
        }
        const cx = (pinBounds.minX + pinBounds.maxX) / 2;
        const cy = (pinBounds.minY + pinBounds.maxY) / 2;
        const bodyW = Math.max(pinBounds.width, 12);
        const bodyH = Math.max(pinBounds.height, 12);
        ctx.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        ctx.fillRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH);
        ctx.strokeStyle = ProteusColors.COMPONENT_STROKE;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - bodyW / 2, cy - bodyH / 2, bodyW, bodyH);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
