/**
 * 左侧库面板 + 导航器 — 从 Index 拆分
 */
import { AppService } from '../services/AppService';
import { ComponentPreview } from './ComponentPreview';
import {
  ProteusPanelTitle, ProteusNavTab, ProteusTreeRow, ProteusNavCompRow, ProteusNavNetRow, ProteusErcRow,
  ProteusTextInput
} from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import {
  ComponentCategory, ComponentInstance, ErcError, SchematicDocument
} from 'common';

interface CategoryNode {
  cat: ComponentCategory;
  label: string;
  expanded: boolean;
}

@Component
export struct AppLeftPanel {
  @Prop projectName: string = '';
  @Link searchKeyword: string;
  @Link componentList: string[];
  @Link selectedTreeItem: string;
  @Link previewComponentId: string;
  @Link navTab: number;
  @Link leftLibCollapsed: boolean;
  @Link leftNavCollapsed: boolean;
  @Link selectedComponentId: string;
  @Link navRefreshKey: number;
  @Prop ercErrors: ErcError[] = [];
  @Prop categoryNodes: CategoryNode[] = [];
  @Prop expandedCategories: Set<ComponentCategory> = new Set();
  onRefreshList: () => void = () => {};
  onSelectLibraryItem: (item: string) => void = () => {};
  onPlaceComponent: (libraryId: string) => void = () => {};
  onToggleCategory: (cat: ComponentCategory) => void = () => {};
  onSelectComponent: (compId: string) => void = () => {};

  private appService: AppService = AppService.getInstance();

  build() {
    Column() {
      if (!this.leftLibCollapsed) {
        Column() {
          ProteusPanelTitle({
            title: $r('app.string.left_library'),
            collapsed: false,
            onToggle: () => { this.leftLibCollapsed = true; }
          })
          ProteusTextInput({
            placeholder: $r('app.string.search_placeholder'),
            text: this.searchKeyword,
            onChange: (v: string) => {
              this.searchKeyword = v;
              this.onRefreshList();
            }
          })
            .margin({ left: 4, right: 4, top: 4, bottom: 2 })
            .width('100%')

          Scroll() {
            Column() {
              if (this.searchKeyword.length > 0) {
                ForEach(this.componentList, (item: string) => {
                  ProteusTreeRow({
                    label: item.split('|')[1] ?? item,
                    selected: this.selectedTreeItem === item,
                    onClickRow: () => this.onSelectLibraryItem(item),
                    onDoubleClick: () => this.onPlaceComponent(item.split('|')[0])
                  })
                }, (item: string) => item)
              } else {
                ForEach(this.categoryNodes, (node: CategoryNode) => {
                  Column() {
                    ProteusTreeRow({
                      label: node.label,
                      expandable: true,
                      expanded: this.expandedCategories.has(node.cat),
                      onToggleExpand: () => this.onToggleCategory(node.cat),
                      onClickRow: () => this.onToggleCategory(node.cat)
                    })
                    if (this.expandedCategories.has(node.cat)) {
                      this.CategoryItems(node.cat)
                    }
                  }
                }, (node: CategoryNode) => node.cat)
              }
            }
            .width('100%')
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Auto)

          ComponentPreview({ libraryId: this.previewComponentId })
            .onClick(() => {
              if (this.previewComponentId) {
                this.onPlaceComponent(this.previewComponentId);
              } else if (this.selectedTreeItem) {
                this.onPlaceComponent(this.selectedTreeItem.split('|')[0]);
              }
            })
        }
        .layoutWeight(3)
        .width('100%')
      }

      if (!this.leftNavCollapsed) {
        Column() {
          ProteusPanelTitle({
            title: $r('app.string.left_navigator'),
            collapsed: false,
            onToggle: () => { this.leftNavCollapsed = true; }
          })
          Row() {
            ProteusNavTab({ label: $r('app.string.nav_sheet_tree'), selected: this.navTab === 0, onSelect: () => { this.navTab = 0; } })
            ProteusNavTab({ label: $r('app.string.nav_component_list'), selected: this.navTab === 1, onSelect: () => { this.navTab = 1; } })
            ProteusNavTab({ label: $r('app.string.nav_net_list'), selected: this.navTab === 2, onSelect: () => { this.navTab = 2; } })
            ProteusNavTab({ label: $r('app.string.nav_error_list'), selected: this.navTab === 3, onSelect: () => { this.navTab = 3; } })
          }
          .width('100%')
          .backgroundColor(ProteusColors.PANEL_TITLE_BG)

          Scroll() {
            Column() {
              if (this.navTab === 0) {
                this.NavSheetTree()
              } else if (this.navTab === 1) {
                this.NavComponentList()
              } else if (this.navTab === 2) {
                this.NavNetList()
              } else {
                this.NavErrorList()
              }
            }
            .width('100%')
            .alignItems(HorizontalAlign.Start)
          }
          .layoutWeight(1)
          .width('100%')
          .backgroundColor(ProteusColors.CANVAS_BG)
        }
        .layoutWeight(1)
        .width('100%')
        .border({ width: { top: 1 }, color: ProteusColors.DIVIDER })
      }
    }
    .width(ProteusDimens.LEFT_PANEL_WIDTH)
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
    .border({ width: { right: 1 }, color: ProteusColors.DIVIDER })
  }

  @Builder
  CategoryItems(cat: ComponentCategory) {
    ForEach(this.getCategoryItems(cat), (item: string) => {
      ProteusTreeRow({
        label: item.split('|')[1] ?? item,
        depth: 1,
        selected: this.selectedTreeItem === item,
        onClickRow: () => this.onSelectLibraryItem(item),
        onDoubleClick: () => this.onPlaceComponent(item.split('|')[0])
      })
    }, (item: string) => item)
  }

  getCategoryItems(cat: ComponentCategory): string[] {
    const items = this.appService.componentLibrary.listAllByCategory(cat);
    return items.map(c => `${c.id}|${c.name}`);
  }

  @Builder
  NavSheetTree() {
    ProteusTreeRow({
      label: this.projectName,
      expandable: true,
      expanded: true,
      selected: true,
      onClickRow: () => {},
      onToggleExpand: () => {}
    })
    ProteusTreeRow({
      label: $r('app.string.nav_sheet1'),
      depth: 1,
      selected: false,
      onClickRow: () => {}
    })
  }

  @Builder
  NavComponentList() {
    ForEach(this.getDocComponents(), (comp: ComponentInstance) => {
      ProteusNavCompRow({
        refDes: `${comp.refDes}`,
        libraryId: `${comp.libraryId}`,
        selected: comp.id === this.selectedComponentId,
        onAction: () => this.onSelectComponent(comp.id)
      })
    }, (comp: ComponentInstance) => `${comp.id}_${this.navRefreshKey}`)
  }

  getDocComponents(): ComponentInstance[] {
    return this.appService.schematicEditor.getDocument().components;
  }

  @Builder
  NavNetList() {
    ForEach(this.getDocNets(), (netName: string, idx: number) => {
      ProteusNavNetRow({
        label: `NET ${idx + 1}`,
        onAction: () => {}
      })
    }, (netName: string, idx: number) => `${netName}_${idx}`)
  }

  getDocNets(): string[] {
    const doc: SchematicDocument = this.appService.schematicEditor.getDocument();
    const nets: Set<string> = new Set();
    for (let i = 0; i < doc.wires.length; i++) {
      nets.add(doc.wires[i].netId);
    }
    const result: string[] = [];
    nets.forEach((n: string) => result.push(n));
    return result;
  }

  @Builder
  NavErrorList() {
    if (this.ercErrors.length === 0) {
      Row() {
        Text($r('app.string.no_erc_errors'))
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.ERC_OK)
      }
      .padding({ left: 8, top: 8 })
    } else {
      ForEach(this.ercErrors, (err: ErcError, idx: number) => {
        ProteusErcRow({
          mark: err.severity === 'error' || err.severity === 'critical' ? '✕' : '⚠',
          markColor: err.severity === 'error' || err.severity === 'critical' ?
            ProteusColors.ERC_ERR : ProteusColors.ERC_WARN,
          desc: err.desc,
          onAction: () => {}
        })
      }, (err: ErcError, idx: number) => `${idx}_${err.desc}`)
    }
  }
}
