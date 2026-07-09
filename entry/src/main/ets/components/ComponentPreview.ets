/**
 * 器件库符号预览 — Proteus 风格缩略图
 */
import { AppService } from '../services/AppService';
import { ComponentLibraryImpl } from 'component_library';
import { SchematicSymbolRenderer } from '../utils/SchematicSymbolRenderer';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { calcSymbolBounds } from 'common';
import { ComponentDefinition } from 'component_library';

@Component
export struct ComponentPreview {
  @Prop @Watch('onLibraryIdChange') libraryId: string = '';
  @State private previewVersion: number = 0;

  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private appService: AppService = AppService.getInstance();
  private canvasW: number = 200;
  private canvasH: number = ProteusDimens.PREVIEW_HEIGHT - 28;

  onLibraryIdChange(): void {
    this.previewVersion++;
    this.redraw();
  }

  build() {
    Column({ space: 2 }) {
      Canvas(this.context)
        .width('100%')
        .height(ProteusDimens.PREVIEW_HEIGHT - 28)
        .backgroundColor(ProteusColors.PREVIEW_BG)
        .border({ width: 1, color: ProteusColors.DIVIDER, style: BorderStyle.Solid })
        .onReady(() => this.redraw())
        .onAreaChange((_old, area) => {
          this.canvasW = area.width as number;
          this.canvasH = area.height as number;
          this.redraw();
        })

      Text(this.libraryId || '—')
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .width('100%')
    .height(ProteusDimens.PREVIEW_HEIGHT)
    .backgroundColor(ProteusColors.PREVIEW_BG)
    .justifyContent(FlexAlign.Center)
    .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
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

    SchematicSymbolRenderer.drawComponent(
      ctx, 0, 0, def, 'REF', 0, false,
      {
        strokeColor: ProteusColors.COMPONENT_STROKE,
        fillColor: ProteusColors.PREVIEW_BG,
        lineWidth: 1.2 / scale,
        selected: false,
        hovered: false
      }
    );
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
}
