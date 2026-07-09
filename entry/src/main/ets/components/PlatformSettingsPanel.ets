/**
 * 平台设置面板 - 离线模式 / 代理 / 无障碍 / 打印
 */
import { AppService } from '../services/AppService';
import { AccessibilityConfig } from 'common';
import { ProteusClassicBtn } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { ThemeManager } from '../theme/ThemeManager';

@Component
export struct PlatformSettingsPanel {
  @Link statusMessage: string;
  @Link themeRefreshKey: number;
  @State offlineMode: boolean = false;
  @State globalProxy: string = '';
  @State highContrast: boolean = false;
  @State uiScale: number = 100;
  @State screenReader: boolean = false;
  @State paperSize: string = 'A4';
  @State darkTheme: boolean = ThemeManager.getInstance().isDark();

  private appService: AppService = AppService.getInstance();

  build() {
    Scroll() {
      Column({ space: 0 }) {
        Text('平台设置')
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontWeight(FontWeight.Medium)
          .margin({ left: 8, top: 6, bottom: 6 })

        // ---- 外观 ----
        Column() {
          Text('外观主题')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .margin({ left: 8, top: 4, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row() {
            Text('深色主题')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Text(this.darkTheme ? '已启用' : '未启用')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .margin({ right: 8 })
            Toggle({ type: ToggleType.Switch, isOn: this.darkTheme })
              .onChange((on: boolean) => {
                this.darkTheme = on;
                ThemeManager.getInstance().setMode(on ? 'dark' : 'light');
                this.themeRefreshKey++;
                this.statusMessage = on ? '已启用深色主题' : '已启用浅色主题';
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 4 })
        }
        .width('100%')

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        // ---- 网络与 AI ----
        Column() {
          Text('网络与 AI')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .margin({ left: 8, top: 6, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row() {
            Text('离线模式')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Text(this.offlineMode ? '仅本地计算' : '联网可用')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_SECONDARY)
              .margin({ right: 8 })
            Toggle({ type: ToggleType.Switch, isOn: this.offlineMode })
              .onChange((on: boolean) => {
                this.offlineMode = on;
                this.appService.setOfflineMode(on);
                this.statusMessage = on ? '已开启离线模式（仅本地）' : '已关闭离线模式';
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 4 })

          Row() {
            Text('全局代理:')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_LABEL)
              .width(64)
            TextInput({ text: this.globalProxy, placeholder: 'http://127.0.0.1:7890' })
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
              .height(ProteusDimens.PARAM_ROW_HEIGHT)
              .borderRadius(0)
              .border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .onChange((v: string) => { this.globalProxy = v; })
            ProteusClassicBtn({
              label: '应用',
              widthVal: 52,
              onAction: () => {
                this.appService.setGlobalProxy(this.globalProxy);
                this.statusMessage = '代理已更新';
              }
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 4 })
          .alignItems(VerticalAlign.Center)
        }
        .width('100%')

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        // ---- 无障碍 ----
        Column() {
          Text('无障碍')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .margin({ left: 8, top: 6, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row() {
            Text('高对比度')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.highContrast })
              .onChange((on: boolean) => {
                this.highContrast = on;
                this.applyAccessibility();
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 4 })

          Row() {
            Text(`UI 缩放: ${this.uiScale}%`)
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .width(110)
            Slider({ value: this.uiScale, min: 100, max: 150, step: 25 })
              .layoutWeight(1)
              .onChange((v: number) => {
                this.uiScale = v;
                this.applyAccessibility();
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 4 })

          Row() {
            Text('语音朗读')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.screenReader })
              .onChange((on: boolean) => {
                this.screenReader = on;
                this.applyAccessibility();
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 4 })
        }
        .width('100%')

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        // ---- 版本与隐私 ----
        Column() {
          Text('版本与隐私')
            .fontSize(ProteusFonts.TITLE)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .margin({ left: 8, top: 6, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row({ space: 6 }) {
            ProteusClassicBtn({
              label: '保存快照',
              widthVal: '30%',
              onAction: () => {
                this.appService.saveSnapshot('手动快照', '用户手动保存');
                this.statusMessage = '版本快照已保存';
              }
            })
            ProteusClassicBtn({
              label: '隐私清理',
              widthVal: '30%',
              onAction: () => {
                this.appService.privacyCleanup();
                this.statusMessage = '已清理 AI 缓存与临时文件';
              }
            })
            ProteusClassicBtn({
              label: '同意隐私政策',
              widthVal: '30%',
              onAction: () => {
                void this.appService.acceptPrivacyPolicy();
                this.statusMessage = '已记录隐私政策同意';
              }
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 8 })
        }
        .width('100%')
      }
      .alignItems(HorizontalAlign.Start)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
  }

  private applyAccessibility(): void {
    const cfg: AccessibilityConfig = {
      highContrast: this.highContrast,
      keyboardOnly: false,
      uiScale: this.uiScale / 100,
      screenReader: this.screenReader
    };
    this.appService.setAccessibility(cfg);
  }
}
