/**
 * 平台设置面板 - 离线模式 / 代理 / 无障碍 / 打印
 */
import { AppService } from '../services/AppService';
import { AccessibilityConfig } from 'common';
import { ProteusClassicBtn, ProteusSectionTitle } from './proteus/ProteusWidgets';
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
  @State darkTheme: boolean = ThemeManager.getInstance().isDark();

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.darkTheme = ThemeManager.getInstance().isDark();
  }

  build() {
    Scroll() {
      Column({ space: 0 }) {
        ProteusSectionTitle({ title: '平台设置' })

        Column() {
          Text('外观主题')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .padding({ left: 8, top: 4, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row({ space: 8 }) {
            Text('深色主题')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Text(this.darkTheme ? '已启用' : '未启用')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_SECONDARY)
            Toggle({ type: ToggleType.Switch, isOn: this.darkTheme })
              .selectedColor(ProteusColors.BTN_FOCUS)
              .width(48)
              .height(28)
              .onChange((on: boolean) => {
                this.darkTheme = on;
                ThemeManager.getInstance().setMode(on ? 'dark' : 'light');
                this.themeRefreshKey++;
                this.statusMessage = on ? '已启用深色主题' : '已启用浅色主题';
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 6 })
          .alignItems(VerticalAlign.Center)

          Row({ space: 8 }) {
            ProteusClassicBtn({
              label: '浅色',
              widthVal: '46%',
              onAction: () => {
                this.darkTheme = false;
                ThemeManager.getInstance().setMode('light');
                this.themeRefreshKey++;
                this.statusMessage = '已启用浅色主题';
              }
            })
            ProteusClassicBtn({
              label: '深色',
              widthVal: '46%',
              onAction: () => {
                this.darkTheme = true;
                ThemeManager.getInstance().setMode('dark');
                this.themeRefreshKey++;
                this.statusMessage = '已启用深色主题';
              }
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, bottom: 8 })
        }
        .width('100%')

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        Column() {
          Text('网络与 AI')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .padding({ left: 8, top: 6, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row({ space: 8 }) {
            Text('离线模式')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Text(this.offlineMode ? '仅本地' : '可联网')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_SECONDARY)
            Toggle({ type: ToggleType.Switch, isOn: this.offlineMode })
              .selectedColor(ProteusColors.BTN_FOCUS)
              .width(48)
              .height(28)
              .onChange((on: boolean) => {
                this.offlineMode = on;
                this.appService.setOfflineMode(on);
                this.statusMessage = on ? '已开启离线模式（仅本地）' : '已关闭离线模式';
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 6 })
          .alignItems(VerticalAlign.Center)

          Row({ space: 8 }) {
            ProteusClassicBtn({
              label: this.offlineMode ? '关闭离线' : '开启离线',
              widthVal: '92%',
              onAction: () => {
                this.offlineMode = !this.offlineMode;
                this.appService.setOfflineMode(this.offlineMode);
                this.statusMessage = this.offlineMode ? '已开启离线模式（仅本地）' : '已关闭离线模式';
              }
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, bottom: 4 })

          Row() {
            Text('全局代理')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_LABEL)
              .width(ProteusDimens.PARAM_LABEL_WIDTH)
            TextInput({ text: this.globalProxy, placeholder: 'http://127.0.0.1:7890' })
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
              .height(ProteusDimens.PARAM_ROW_HEIGHT)
              .borderRadius(0)
              .border({ width: 1, color: ProteusColors.INPUT_BORDER })
              .backgroundColor(ProteusColors.CANVAS_BG)
              .onChange((v: string) => { this.globalProxy = v; })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4 })
          .alignItems(VerticalAlign.Center)

          ProteusClassicBtn({
            label: '应用代理设置',
            widthVal: '92%',
            onAction: () => {
              this.appService.setGlobalProxy(this.globalProxy);
              this.statusMessage = this.globalProxy.length > 0
                ? `代理已更新: ${this.globalProxy}`
                : '代理已清空';
            }
          })
          .margin({ left: 8, right: 8, bottom: 8, top: 4 })
        }
        .width('100%')

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        Column() {
          Text('无障碍')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .padding({ left: 8, top: 6, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Row({ space: 8 }) {
            Text('高对比度')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.highContrast })
              .selectedColor(ProteusColors.BTN_FOCUS)
              .width(48)
              .height(28)
              .onChange((on: boolean) => {
                this.highContrast = on;
                this.applyAccessibility();
                this.statusMessage = on ? '已开启高对比度' : '已关闭高对比度';
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 6 })
          .alignItems(VerticalAlign.Center)

          Column({ space: 4 }) {
            Text(`UI 缩放: ${this.uiScale}%`)
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .padding({ left: 8 })
              .alignSelf(ItemAlign.Start)
            Slider({ value: this.uiScale, min: 100, max: 150, step: 25 })
              .width('92%')
              .margin({ left: 8, right: 8 })
              .onChange((v: number) => {
                this.uiScale = Math.round(v);
                this.applyAccessibility();
                this.statusMessage = `UI 缩放 ${this.uiScale}%`;
              })
            Row({ space: 6 }) {
              ProteusClassicBtn({
                label: '100%',
                widthVal: '30%',
                onAction: () => {
                  this.uiScale = 100;
                  this.applyAccessibility();
                  this.statusMessage = 'UI 缩放 100%';
                }
              })
              ProteusClassicBtn({
                label: '125%',
                widthVal: '30%',
                onAction: () => {
                  this.uiScale = 125;
                  this.applyAccessibility();
                  this.statusMessage = 'UI 缩放 125%';
                }
              })
              ProteusClassicBtn({
                label: '150%',
                widthVal: '30%',
                onAction: () => {
                  this.uiScale = 150;
                  this.applyAccessibility();
                  this.statusMessage = 'UI 缩放 150%';
                }
              })
            }
            .width('100%')
            .padding({ left: 8, right: 8, bottom: 4 })
          }
          .width('100%')

          Row({ space: 8 }) {
            Text('语音朗读')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            Toggle({ type: ToggleType.Switch, isOn: this.screenReader })
              .selectedColor(ProteusColors.BTN_FOCUS)
              .width(48)
              .height(28)
              .onChange((on: boolean) => {
                this.screenReader = on;
                this.applyAccessibility();
                this.statusMessage = on ? '已开启语音朗读' : '已关闭语音朗读';
              })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 8 })
          .alignItems(VerticalAlign.Center)
        }
        .width('100%')

        Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

        Column() {
          Text('版本与隐私')
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_LABEL)
            .fontWeight(FontWeight.Medium)
            .padding({ left: 8, top: 6, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Column({ space: 8 }) {
            ProteusClassicBtn({
              label: '保存快照',
              widthVal: '92%',
              onAction: () => {
                this.appService.saveSnapshot('手动快照', '用户手动保存');
                this.statusMessage = '版本快照已保存';
              }
            })
            ProteusClassicBtn({
              label: '隐私清理',
              widthVal: '92%',
              onAction: () => {
                this.appService.privacyCleanup();
                this.statusMessage = '已清理 AI 缓存与临时文件';
              }
            })
            ProteusClassicBtn({
              label: '同意隐私政策',
              widthVal: '92%',
              onAction: () => {
                void this.appService.acceptPrivacyPolicy().then(() => {
                  this.statusMessage = '已记录隐私政策同意';
                });
              }
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4, bottom: 16 })
          .alignItems(HorizontalAlign.Start)
        }
        .width('100%')
      }
      .alignItems(HorizontalAlign.Start)
      .width('100%')
      .padding({ bottom: 12 })
    }
    .width('100%')
    .height('100%')
    .scrollBar(BarState.Auto)
    .align(Alignment.TopStart)
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
