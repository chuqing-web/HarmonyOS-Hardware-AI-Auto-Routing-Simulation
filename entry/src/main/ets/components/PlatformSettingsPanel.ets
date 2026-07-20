/**
 * 平台设置面板 - 主题 / 离线 / 代理 / 无障碍 / 隐私
 * 所有开关写入 AppService 并持久化，通过 themeRefreshKey 强制主界面重绘。
 */
import { AppService } from '../services/AppService';
import { AccessibilityConfig, appVersionLabel } from 'common';
import { ProteusClassicBtn, ProteusSectionTitle, ProteusSwitch, ProteusTextInput } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';
import { ThemeManager, PROTEUS_THEME_REV_KEY } from '../theme/ThemeManager';

@Component
export struct PlatformSettingsPanel {
  @Link statusMessage: string;
  @Link themeRefreshKey: number;
  /** 与 ThemeManager 广播同步，确保设置面板自身色值随主题刷新 */
  @StorageProp(PROTEUS_THEME_REV_KEY) themeRev: number = 0;
  @State offlineMode: boolean = false;
  @State globalProxy: string = '';
  @State highContrast: boolean = false;
  @State uiScale: number = 100;
  @State screenReader: boolean = false;
  @State darkTheme: boolean = false;
  @State appVersion: string = appVersionLabel();

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.reloadFromService();
  }

  private reloadFromService(): void {
    this.darkTheme = ThemeManager.getInstance().isDark();
    this.offlineMode = this.appService.isOfflineMode();
    this.globalProxy = this.appService.getGlobalProxy();
    const a11y = this.appService.getAccessibility();
    this.highContrast = a11y.highContrast;
    this.uiScale = Math.round(a11y.uiScale * 100);
    this.screenReader = a11y.screenReader;
  }

  private bumpUi(): void {
    this.themeRefreshKey++;
  }

  private applyTheme(dark: boolean): void {
    this.darkTheme = dark;
    ThemeManager.getInstance().setMode(dark ? 'dark' : 'light');
    this.bumpUi();
    this.statusMessage = dark ? '已启用深色主题' : '已启用浅色主题';
    this.appService.announceIfScreenReader(this.statusMessage);
  }

  private applyAccessibility(): void {
    const cfg: AccessibilityConfig = {
      highContrast: this.highContrast,
      keyboardOnly: false,
      uiScale: this.uiScale / 100,
      screenReader: this.screenReader
    };
    this.appService.setAccessibility(cfg);
    this.bumpUi();
  }

  build() {
    Scroll() {
      Column({ space: 0 }) {
        // 依赖 themeRev / themeRefreshKey，确保切换主题后本面板自身也刷新色值
        Text(`设置 · ${this.themeRev}_${this.themeRefreshKey}`)
          .fontSize(1)
          .height(0)
          .opacity(0)

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
            ProteusSwitch({
              isOn: this.darkTheme,
              onChange: (on: boolean) => { this.applyTheme(on); }
            })
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 6 })
          .alignItems(VerticalAlign.Center)

          Row({ space: 8 }) {
            ProteusClassicBtn({
              label: '浅色',
              widthVal: '46%',
              onAction: () => { this.applyTheme(false); }
            })
            ProteusClassicBtn({
              label: '深色',
              widthVal: '46%',
              onAction: () => { this.applyTheme(true); }
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
            ProteusSwitch({
              isOn: this.offlineMode,
              onChange: (on: boolean) => {
                this.offlineMode = on;
                this.appService.setOfflineMode(on);
                this.statusMessage = on ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式';
              }
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
                this.statusMessage = this.offlineMode ? '已开启离线模式（禁止云端 AI）' : '已关闭离线模式';
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
            ProteusTextInput({
              text: this.globalProxy,
              placeholder: '启用系统代理（如 Clash）',
              onChange: (v: string) => { this.globalProxy = v; }
            })
              .layoutWeight(1)
          }
          .width('100%')
          .padding({ left: 8, right: 8, top: 4 })
          .alignItems(VerticalAlign.Center)

          Text('填写任意非空内容并点「应用」后，AI 请求会走系统代理(usingProxy)。')
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .padding({ left: 8, right: 8, top: 2 })
            .width('100%')
          Text('鸿蒙应用默认不走 Clash/VPN：若测试报 DNS 失败，请开启此项或确保代理软件在线。清空并应用则直连。')
            .fontSize(ProteusFonts.STATUS)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .padding({ left: 8, right: 8, top: 2 })
            .width('100%')

          ProteusClassicBtn({
            label: '应用代理设置',
            widthVal: '92%',
            onAction: () => {
              this.appService.setGlobalProxy(this.globalProxy);
              this.statusMessage = this.globalProxy.trim().length > 0
                ? `代理已启用系统代理: ${this.globalProxy.trim()}`
                : '代理已清空（直连）';
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
            ProteusSwitch({
              isOn: this.highContrast,
              onChange: (on: boolean) => {
                this.highContrast = on;
                this.applyAccessibility();
                this.statusMessage = on ? '已开启高对比度' : '已关闭高对比度';
                this.appService.announceIfScreenReader(this.statusMessage);
              }
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
            Text('语音朗读提示')
              .fontSize(ProteusFonts.PARAM_KEY)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .layoutWeight(1)
            ProteusSwitch({
              isOn: this.screenReader,
              onChange: (on: boolean) => {
                this.screenReader = on;
                this.applyAccessibility();
                this.statusMessage = on ? '已开启语音朗读提示（状态栏播报）' : '已关闭语音朗读提示';
              }
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

          Text(`软件版本 ${this.appVersion}`)
            .fontSize(ProteusFonts.PARAM_VALUE)
            .fontColor(ProteusColors.TEXT_SECONDARY)
            .padding({ left: 8, bottom: 4 })
            .alignSelf(ItemAlign.Start)

          Column({ space: 8 }) {
            ProteusClassicBtn({
              label: '保存快照',
              widthVal: '92%',
              onAction: () => {
                this.appService.saveSnapshot('手动快照', '用户手动保存');
                this.statusMessage = '版本快照已保存';
                this.appService.announceIfScreenReader(this.statusMessage);
              }
            })
            ProteusClassicBtn({
              label: '隐私清理',
              widthVal: '92%',
              onAction: () => {
                this.appService.privacyCleanup();
                this.statusMessage = '已清理 AI 缓存与临时文件';
                this.appService.announceIfScreenReader(this.statusMessage);
              }
            })
            ProteusClassicBtn({
              label: '同意隐私政策',
              widthVal: '92%',
              onAction: () => {
                void this.appService.acceptPrivacyPolicy().then(() => {
                  this.statusMessage = '已记录隐私政策同意';
                  this.appService.announceIfScreenReader(this.statusMessage);
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
}
