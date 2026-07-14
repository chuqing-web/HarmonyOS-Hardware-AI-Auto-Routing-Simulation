if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface ComponentPreview_Params {
    libraryId?: string;
    previewVersion?: number;
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
    constructor(w70, x70, y70, z70 = -1, a71 = undefined, b71) {
        super(w70, y70, z70, b71);
        if (typeof a71 === "function") {
            this.paramsGenerator_ = a71;
        }
        this.__libraryId = new SynchedPropertySimpleOneWayPU(x70.libraryId, this, "libraryId");
        this.__previewVersion = new ObservedPropertySimplePU(0, this, "previewVersion");
        this.settings = new RenderingContextSettings(true);
        this.context = new CanvasRenderingContext2D(this.settings);
        this.appService = AppService.getInstance();
        this.canvasW = 200;
        this.canvasH = ProteusDimens.PREVIEW_HEIGHT - 28;
        this.setInitiallyProvidedValue(x70);
        this.declareWatch("libraryId", this.onLibraryIdChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(v70: ComponentPreview_Params) {
        if (v70.libraryId === undefined) {
            this.__libraryId.set('');
        }
        if (v70.previewVersion !== undefined) {
            this.previewVersion = v70.previewVersion;
        }
        if (v70.settings !== undefined) {
            this.settings = v70.settings;
        }
        if (v70.context !== undefined) {
            this.context = v70.context;
        }
        if (v70.appService !== undefined) {
            this.appService = v70.appService;
        }
        if (v70.canvasW !== undefined) {
            this.canvasW = v70.canvasW;
        }
        if (v70.canvasH !== undefined) {
            this.canvasH = v70.canvasH;
        }
    }
    updateStateVars(u70: ComponentPreview_Params) {
        this.__libraryId.reset(u70.libraryId);
    }
    purgeVariableDependenciesOnElmtId(t70) {
        this.__libraryId.purgeDependencyOnElmtId(t70);
        this.__previewVersion.purgeDependencyOnElmtId(t70);
    }
    aboutToBeDeleted() {
        this.__libraryId.aboutToBeDeleted();
        this.__previewVersion.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __libraryId: SynchedPropertySimpleOneWayPU<string>;
    get libraryId() {
        return this.__libraryId.get();
    }
    set libraryId(s70: string) {
        this.__libraryId.set(s70);
    }
    private __previewVersion: ObservedPropertySimplePU<number>;
    get previewVersion() {
        return this.__previewVersion.get();
    }
    set previewVersion(r70: number) {
        this.__previewVersion.set(r70);
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
        this.observeComponentCreation2((p70, q70) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.height(ProteusDimens.PREVIEW_HEIGHT);
            Column.backgroundColor(ProteusColors.PREVIEW_BG);
            Column.justifyContent(FlexAlign.Center);
            Column.border({ width: { top: 1 }, color: ProteusColors.DIVIDER });
        }, Column);
        this.observeComponentCreation2((l70, m70) => {
            Canvas.create(this.context);
            Canvas.width('100%');
            Canvas.height(ProteusDimens.PREVIEW_HEIGHT - 28);
            Canvas.backgroundColor(ProteusColors.PREVIEW_BG);
            Canvas.border({ width: 1, color: ProteusColors.DIVIDER, style: BorderStyle.Solid });
            Canvas.onReady(() => this.redraw());
            Canvas.onAreaChange((n70, o70) => {
                this.canvasW = o70.width as number;
                this.canvasH = o70.height as number;
                this.redraw();
            });
        }, Canvas);
        Canvas.pop();
        this.observeComponentCreation2((j70, k70) => {
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
        const t69 = this.context;
        const u69 = this.canvasW;
        const v69 = this.canvasH;
        if (u69 <= 0 || v69 <= 0) {
            return;
        }
        t69.clearRect(0, 0, u69, v69);
        t69.fillStyle = ProteusColors.PREVIEW_BG;
        t69.fillRect(0, 0, u69, v69);
        if (this.libraryId.length === 0) {
            t69.fillStyle = ProteusColors.TEXT_LABEL;
            t69.font = `${ProteusFonts.STATUS}px sans-serif`;
            t69.textAlign = 'center';
            t69.fillText('器件预览', u69 / 2, v69 / 2);
            t69.textAlign = 'start';
            return;
        }
        const w69 = this.appService.componentLibrary as ComponentLibraryImpl;
        const x69 = w69.resolveLibraryId(this.libraryId);
        const y69 = w69.getComponent(x69);
        if (!y69.success || !y69.data) {
            t69.fillStyle = ProteusColors.TEXT_LABEL;
            t69.font = `${ProteusFonts.STATUS}px sans-serif`;
            t69.textAlign = 'center';
            t69.fillText(this.libraryId, u69 / 2, v69 / 2);
            t69.textAlign = 'start';
            return;
        }
        const z69 = y69.data;
        const a70 = 16;
        const b70 = u69 - a70 * 2;
        const c70 = v69 - a70 * 2;
        let d70 = 60;
        let e70 = 40;
        if (z69.pins.length > 0) {
            const i70 = calcSymbolBounds(z69.pins, 10);
            d70 = Math.max(60, i70.width + 16);
            e70 = Math.max(40, i70.height + 16);
        }
        const f70 = b70 / d70;
        const g70 = c70 / e70;
        const h70 = Math.min(f70, g70, 1.2);
        t69.save();
        t69.translate(u69 / 2, v69 / 2);
        t69.scale(h70, h70);
        this.drawPreviewBackdrop(t69, z69);
        SchematicSymbolRenderer.drawComponent(t69, 0, 0, z69, 'REF', 0, false, {
            strokeColor: ProteusColors.COMPONENT_STROKE,
            fillColor: ProteusColors.PREVIEW_BG,
            lineWidth: 1.2 / h70,
            selected: false,
            hovered: false
        });
        t69.restore();
    }
    private drawPreviewBackdrop(m69: CanvasRenderingContext2D, n69: ComponentDefinition): void {
        if (n69.pins.length === 0) {
            return;
        }
        const o69 = calcSymbolBounds(n69.pins, 0);
        if (o69.width < 50 || o69.height < 40) {
            return;
        }
        const p69 = (o69.minX + o69.maxX) / 2;
        const q69 = (o69.minY + o69.maxY) / 2;
        const r69 = Math.max(o69.width, 12);
        const s69 = Math.max(o69.height, 12);
        m69.fillStyle = ProteusColors.COMPONENT_BODY_FILL;
        m69.fillRect(p69 - r69 / 2, q69 - s69 / 2, r69, s69);
        m69.strokeStyle = ProteusColors.COMPONENT_STROKE;
        m69.lineWidth = 2;
        m69.strokeRect(p69 - r69 / 2, q69 - s69 / 2, r69, s69);
    }
    rerender() {
        this.updateDirtyElements();
    }
}
