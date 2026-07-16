/**
 * 图层可见性/锁定控制面板
 */
import { SchematicEditorImpl, SchematicLayerId } from 'schematic_editor';
import { AppService } from '../services/AppService';
import { ProteusColors, ProteusFonts } from '../theme/ProteusTheme';
import { ProteusSwitch } from './proteus/ProteusWidgets';

@Component
export struct LayerPanel {
  @Link canvasVersion: number;
  onLayerChanged: () => void = () => {};

  private appService: AppService = AppService.getInstance();

  build() {
    Column({ space: 2 }) {
      Text($r('app.string.layer_title'))
        .fontSize(ProteusFonts.PARAM_KEY)
        .fontColor(ProteusColors.TEXT_LABEL)
        .margin({ left: 8, top: 4 })
      this.LayerRow('器件层', SchematicLayerId.COMPONENTS)
      this.LayerRow('布线层', SchematicLayerId.WIRING)
      this.LayerRow('丝印层', SchematicLayerId.SILKSCREEN)
      this.LayerRow('注释层', SchematicLayerId.ANNOTATIONS)
      this.LayerRow('ERC标记', SchematicLayerId.ERC_MARKERS)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  LayerRow(label: string, layerId: SchematicLayerId) {
    Row() {
      Text(label).fontSize(11).fontColor(ProteusColors.TEXT_LABEL).layoutWeight(1)
      ProteusSwitch({
        isOn: this.isVisible(layerId),
        widthVp: 40,
        heightVp: 24,
        onChange: (on: boolean) => {
          const editor = this.appService.schematicEditor as SchematicEditorImpl;
          editor.setLayerVisible(layerId, on);
          this.canvasVersion++;
          this.onLayerChanged();
        }
      })
      ProteusSwitch({
        isOn: this.isLocked(layerId),
        onColor: '#c08020',
        widthVp: 40,
        heightVp: 24,
        onChange: (on: boolean) => {
          const editor = this.appService.schematicEditor as SchematicEditorImpl;
          editor.setLayerLocked(layerId, on);
          this.canvasVersion++;
          this.onLayerChanged();
        }
      })
        .margin({ left: 6 })
    }
    .width('100%')
    .padding({ left: 12, right: 12 })
  }

  private isVisible(layerId: SchematicLayerId): boolean {
    const editor = this.appService.schematicEditor as SchematicEditorImpl;
    return editor.isLayerVisible(layerId);
  }

  private isLocked(layerId: SchematicLayerId): boolean {
    const editor = this.appService.schematicEditor as SchematicEditorImpl;
    return editor.isLayerLocked(layerId);
  }
}
