/**
 * 右侧属性与工具面板 — 从 Index 拆分
 */
import { PropertyPanel } from './PropertyPanel';
import { AiSettingsPanel } from './AiSettingsPanel';
import { McuDebugPanel } from './McuDebugPanel';
import { InstrumentPanel } from './InstrumentPanel';
import { FaultInjectionPanel } from './FaultInjectionPanel';
import { TeachingPanel } from './TeachingPanel';
import { LayerPanel } from './LayerPanel';
import { PlatformSettingsPanel } from './PlatformSettingsPanel';
import { KeyboardSettingsPanel } from './KeyboardSettingsPanel';
import { ProteusPanelTitle, ProteusCollapsibleSection, ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens } from '../theme/ProteusTheme';

@Component
export struct AppRightPanel {
  @Link rightCollapsed: boolean;
  @Link statusMessage: string;
  @Link themeRefreshKey: number;
  @Prop selectedComponentId: string = '';
  @Prop simWaveTick: number = 0;
  @Link canvasVersion: number;
  @State expandedLayers: boolean = true;
  @State expandedShortcuts: boolean = false;
  @Link simRunning: boolean;
  @Link simPaused: boolean;
  @Link expandedSim: boolean;
  @Link expandedAi: boolean;
  @Link expandedDebug: boolean;
  @Link expandedInstr: boolean;
  @Link expandedFault: boolean;
  @Link expandedTeach: boolean;
  @Link expandedSettings: boolean;
  onDeleted: () => void = () => {};
  onSimToggle: () => void = () => {};
  onSimPause: () => void = () => {};

  build() {
    Column() {
      ProteusPanelTitle({
        title: $r('app.string.panel_properties'),
        collapsed: false,
        onToggle: () => { this.rightCollapsed = !this.rightCollapsed; }
      })
      if (!this.rightCollapsed) {
        PropertyPanel({
          selectedComponentId: this.selectedComponentId,
          docVersion: this.canvasVersion,
          simWaveTick: this.simWaveTick,
          statusMessage: $statusMessage,
          onDeleted: () => this.onDeleted()
        })
          .width('100%')
      }

      Scroll() {
        Column() {
          ProteusCollapsibleSection({ title: $r('app.string.panel_sim'), expanded: $expandedSim }) {
            Row({ space: 4 }) {
              ProteusClassicBtn({
                label: this.simRunning ? $r('app.string.sim_stop') : $r('app.string.sim_run'),
                widthVal: 72,
                onAction: () => this.onSimToggle()
              })
              ProteusClassicBtn({
                label: $r('app.string.sim_pause'),
                widthVal: 72,
                onAction: () => this.onSimPause()
              })
            }
            .width('100%')
            .padding({ left: 4, right: 4, top: 3, bottom: 3 })
            .justifyContent(FlexAlign.Start)
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_ai'), expanded: $expandedAi }) {
            AiSettingsPanel({ statusMessage: $statusMessage })
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_mcu'), expanded: $expandedDebug }) {
            McuDebugPanel({ statusMessage: $statusMessage })
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_instruments'), expanded: $expandedInstr }) {
            InstrumentPanel({
              statusMessage: $statusMessage,
              selectedComponentId: this.selectedComponentId,
              simWaveTick: this.simWaveTick,
              simRunning: this.simRunning
            })
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_fault'), expanded: $expandedFault }) {
            FaultInjectionPanel({
              statusMessage: $statusMessage,
              selectedComponentId: this.selectedComponentId
            })
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_teaching'), expanded: $expandedTeach }) {
            TeachingPanel({
              statusMessage: $statusMessage,
              selectedComponentId: this.selectedComponentId
            })
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_layers'), expanded: $expandedLayers }) {
            LayerPanel({
              canvasVersion: $canvasVersion,
              onLayerChanged: () => {}
            })
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_shortcuts'), expanded: $expandedShortcuts }) {
            KeyboardSettingsPanel()
          }

          ProteusCollapsibleSection({ title: $r('app.string.panel_settings'), expanded: $expandedSettings }) {
            PlatformSettingsPanel({ statusMessage: $statusMessage, themeRefreshKey: $themeRefreshKey })
          }
        }
        .width('100%')
      }
      .layoutWeight(1)
      .width('100%')
      .scrollBar(BarState.Auto)
    }
    .width(ProteusDimens.RIGHT_PANEL_WIDTH)
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
    .border({ width: { left: 1 }, color: ProteusColors.DIVIDER })
  }
}
