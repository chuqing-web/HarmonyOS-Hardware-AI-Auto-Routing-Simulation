/**
 * MCU 调试面板 — 支持 HEX 烧录与仿真调试
 */
import util from '@ohos.util';
import fs from '@ohos.file.fs';
import { picker } from '@kit.CoreFileKit';
import { AppService } from '../services/AppService';
import { McuFamily, SimulationState, traceBurn, formatFirmwarePreview } from 'common';
import { ProteusClassicBtn, ProteusSectionTitle } from './proteus/ProteusWidgets';
import { ProteusColors, ProteusDimens, ProteusFonts } from '../theme/ProteusTheme';

@Component
export struct McuDebugPanel {
  @Link statusMessage: string;
  @Prop @Watch('onSelectionChange') selectedComponentId: string = '';
  @State debugState: string = 'reset';
  @State pcValue: string = '0x0000';
  @State registers: string[] = [];
  @State uartOutput: string = '';
  @State hexInput: string = '';
  @State hexFilePath: string = '';
  @State hexDir: string = '';
  @State sandboxHexFiles: string[] = [];
  @State mcuFamily: McuFamily = McuFamily.MCU_8051;
  @State mcuLabel: string = '';
  @State fwSegmentInfo: string = '';
  @State fwEntryAddr: string = '0x0000';
  @State fwTotalSize: string = '';
  private autoRefreshTimer: number = -1;

  private appService: AppService = AppService.getInstance();

  aboutToAppear(): void {
    this.hexDir = this.appService.getHexDir();
    this.sandboxHexFiles = this.appService.listHexFiles();
    if (this.sandboxHexFiles.length > 0) {
      this.hexFilePath = this.sandboxHexFiles[0];
    }
    this.detectMcu();
    const family = this.getFamily();
    this.appService.hexDebugger.configure({
      mcuFamily: family,
      crystalFreq: family === McuFamily.MCU_8051 ? 11059200 : 8000000,
      bootPin: 0,
      resetVector: 0
    });
    this.refreshState();
    this.refreshFirmwareInfo();
    this.startAutoRefresh();
  }

  aboutToDisappear(): void {
    this.stopAutoRefresh();
  }

  onSelectionChange(): void {
    this.detectMcu();
    this.refreshState();
    this.refreshFirmwareInfo();
  }

  startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.autoRefreshTimer = setInterval(() => {
      this.refreshState();
    }, 500);
  }

  stopAutoRefresh(): void {
    if (this.autoRefreshTimer >= 0) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = -1;
    }
  }

  detectMcu(): void {
    if (this.selectedComponentId.length === 0) {
      this.mcuLabel = '';
      return;
    }
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === this.selectedComponentId);
    if (comp) {
      const lib = comp.libraryId.toUpperCase();
      if (lib.startsWith('AT89') || lib.startsWith('STC') || lib.startsWith('8051')) {
        this.mcuFamily = McuFamily.MCU_8051;
        this.mcuLabel = `${comp.refDes} (8051)`;
      } else if (lib.startsWith('STM32')) {
        this.mcuFamily = McuFamily.MCU_STM32F1;
        this.mcuLabel = `${comp.refDes} (STM32)`;
      }
    }
  }

  private getFamily(): McuFamily {
    if (this.selectedComponentId.length === 0) return McuFamily.MCU_8051;
    const doc = this.appService.schematicEditor.getDocument();
    const comp = doc.components.find(c => c.id === this.selectedComponentId);
    if (comp) {
      const lib = comp.libraryId.toUpperCase();
      if (lib.startsWith('AT89') || lib.startsWith('STC') || lib.startsWith('8051')) {
        return McuFamily.MCU_8051;
      } else if (lib.startsWith('STM32')) {
        return McuFamily.MCU_STM32F1;
      }
    }
    return McuFamily.MCU_8051;
  }

  refreshState(): void {
    const kernel = this.appService.simulationKernel;
    const simState = kernel.getState();
    const simSnap = kernel.getMcuSnapshot();
    if (simSnap !== null &&
        (simState === SimulationState.RUNNING || simState === SimulationState.PAUSED)) {
      this.debugState = 'running';
      const pcVal = simSnap.registers.get('PC');
      const pcNum = pcVal !== undefined ? pcVal : 0;
      this.pcValue = `0x${pcNum.toString(16).toUpperCase().padStart(4, '0')}`;
      const regs: string[] = [];
      simSnap.registers.forEach((value: number, key: string) => {
        regs.push(`${key}: 0x${value.toString(16).toUpperCase().padStart(2, '0')}`);
      });
      this.registers = regs;
      this.uartOutput = this.appService.hexDebugger.getUartOutput();
      return;
    }
    const state = this.appService.hexDebugger.getDebugState();
    this.debugState = state;
    const snap = this.appService.hexDebugger.getRegisterSnapshot();
    if (snap) {
      const pcVal = snap.registers.get('PC');
      const pcNum = pcVal !== undefined ? pcVal : 0;
      this.pcValue = `0x${pcNum.toString(16).toUpperCase().padStart(4, '0')}`;
      const regs: string[] = [];
      snap.registers.forEach((value: number, key: string) => {
        regs.push(`${key}: 0x${value.toString(16).toUpperCase().padStart(2, '0')}`);
      });
      this.registers = regs;
    }
    this.uartOutput = this.appService.hexDebugger.getUartOutput();
  }

  refreshFirmwareInfo(): void {
    const parsed = this.appService.hexDebugger.getParsedHexInfo();
    if (parsed) {
      this.fwSegmentInfo = `${parsed.flashSegments.length} 段, ${parsed.totalByteSize} bytes`;
      this.fwEntryAddr = `0x${parsed.minAddr.toString(16).toUpperCase().padStart(4, '0')}`;
      this.fwTotalSize = `${(parsed.totalByteSize / 1024).toFixed(1)} KB`;
    } else {
      this.fwSegmentInfo = '';
      this.fwEntryAddr = '0x0000';
      this.fwTotalSize = '';
    }
  }

  /** Basename for narrow sidebar chips (/ and \\). */
  private hexFileName(hexPath: string): string {
    const slash = hexPath.lastIndexOf('/');
    const back = hexPath.lastIndexOf('\\');
    const idx = Math.max(slash, back);
    return idx >= 0 ? hexPath.substring(idx + 1) : hexPath;
  }

  async browseHexFile(): Promise<void> {
    try {
      const options = new picker.DocumentSelectOptions();
      options.maxSelectNumber = 1;
      options.fileSuffixFilters = ['.hex', '.HEX', '.bin', '.BIN'];
      const docPicker = new picker.DocumentViewPicker();
      const uris = await docPicker.select(options);
      if (uris && uris.length > 0) {
        this.hexFilePath = uris[0];
        return;
      }
    } catch (_e) {
      // fall through to sandbox list
    }
    const sandbox = this.appService.listHexFiles();
    this.sandboxHexFiles = sandbox;
    if (sandbox.length > 0) {
      this.hexFilePath = sandbox[0];
      this.statusMessage = `已选用沙箱固件: ${sandbox[0]}`;
    } else {
      this.statusMessage = `沙箱固件目录为空: ${this.hexDir}`;
    }
  }

  async burnHex(): Promise<void> {
    const path = this.hexFilePath.trim();
    if (path.length === 0) {
      this.statusMessage = '请选择或输入 HEX 文件路径';
      traceBurn('UI_BURN_ABORT', 'empty path (mcu debug panel)');
      return;
    }
    const familyStr = this.mcuFamily === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
    traceBurn('UI_BURN_BEGIN',
      `source=mcu_panel path=${path} family=${familyStr} mcu=${this.mcuLabel || '-'}`);
    try {
      const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(path);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);

      const hexView = new Uint8Array(buffer);
      traceBurn('UI_BURN_READ', `path=${path} size=${stat.size} preview=${formatFirmwarePreview(hexView)}`);
      const result = this.appService.hexDebugger.loadHexData(hexView, this.mcuFamily);
      if (result.success && result.data !== undefined) {
        // Must load parsed binary image — not raw Intel HEX ASCII text
        this.appService.loadMcuIntoSim(result.data.data, 0, familyStr);
        this.refreshFirmwareInfo();
        this.statusMessage = `HEX 烧录成功 (${this.fwTotalSize})`;
        this.refreshState();
        traceBurn('UI_BURN_OK',
          `source=mcu_panel path=${path} size=${this.fwTotalSize} segs=${this.fwSegmentInfo} entry=${this.fwEntryAddr}`);
      } else {
        this.statusMessage = `HEX 加载失败: ${result.error ?? '未知错误'}`;
        traceBurn('UI_BURN_FAIL', `source=mcu_panel path=${path} err=${result.error ?? 'unknown'}`);
      }
    } catch (e) {
      this.statusMessage = `烧录失败: ${e}`;
      traceBurn('UI_BURN_FAIL', `source=mcu_panel path=${path} ex=${e}`);
    }
  }

  build() {
    Column({ space: 6 }) {
      ProteusSectionTitle({ title: 'MCU 调试' })
      Row() {
        Text(`状态: ${this.debugState}`)
          .fontSize(ProteusFonts.TITLE)
          .fontColor(ProteusColors.TEXT_LABEL)
          .fontWeight(FontWeight.Medium)
        Blank()
        Text(`PC: ${this.pcValue}`)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontFamily('monospace')
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 6 })

      // MCU selection info
      Row() {
        Text('目标芯片:')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_LABEL)
        Text(this.mcuLabel || '点击画布中 MCU 芯片选择')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(this.mcuLabel ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY)
          .margin({ left: 4 })
          .layoutWeight(1)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      // Firmware info (shown after successful HEX burn)
      if (this.fwSegmentInfo.length > 0) {
        Column() {
          Row() {
            Text('固件:')
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.TEXT_LABEL)
              .width(32)
            Text(`${this.fwSegmentInfo}`)
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.ERC_OK)
              .layoutWeight(1)
              .maxLines(1)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
          }
          Row() {
            Text('入口:')
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.TEXT_LABEL)
              .width(32)
            Text(this.fwEntryAddr)
              .fontSize(ProteusFonts.STATUS)
              .fontColor(ProteusColors.TEXT_PRIMARY)
              .fontFamily('monospace')
          }
        }
        .width('92%')
        .padding(4)
        .backgroundColor('#0a2a0a')
        .border({ width: 1, color: '#30a030' })
        .margin({ left: 8, right: 8, top: 4 })
      }

      // HEX burn section — stacked for narrow right panel (~200–420px)
      Text(`固件目录: ${this.hexDir}`)
        .fontSize(9)
        .fontColor(ProteusColors.TEXT_SECONDARY)
        .padding({ left: 8, right: 8 })
        .width('100%')
        .maxLines(2)
        .textOverflow({ overflow: TextOverflow.Ellipsis })

      Column() {
        TextInput({ placeholder: '固件路径…', text: this.hexFilePath })
          .width('100%')
          .height(28)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.hexFilePath = v; })
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      Row({ space: 4 }) {
        ProteusClassicBtn({
          label: '浏览',
          widthVal: '48%',
          onAction: () => { void this.browseHexFile(); }
        })
        ProteusClassicBtn({
          label: '烧录',
          widthVal: '48%',
          onAction: () => { void this.burnHex(); }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 4 })
      .justifyContent(FlexAlign.SpaceBetween)

      if (this.sandboxHexFiles.length > 0) {
        Text('沙箱固件（点选即烧录）')
          .fontSize(ProteusFonts.STATUS)
          .fontColor(ProteusColors.TEXT_LABEL)
          .width('100%')
          .padding({ left: 8, right: 8, top: 6, bottom: 2 })
          .alignSelf(ItemAlign.Start)

        Flex({
          wrap: FlexWrap.Wrap,
          justifyContent: FlexAlign.SpaceBetween
        }) {
          ForEach(this.sandboxHexFiles, (hexPath: string) => {
            ProteusClassicBtn({
              label: this.hexFileName(hexPath),
              widthVal: '48%',
              tooltip: hexPath,
              onAction: () => {
                this.hexFilePath = hexPath;
                void this.burnHex();
              }
            })
              .margin({ bottom: 4 })
          }, (hexPath: string) => hexPath)
        }
        .width('100%')
        .padding({ left: 8, right: 8 })
      }

      Row({ space: 4 }) {
        ProteusClassicBtn({ label: '▶ 运行', widthVal: '23%', onAction: () => {
            this.appService.hexDebugger.run();
            this.refreshState();
          }})
        ProteusClassicBtn({ label: '⏸ 暂停', widthVal: '23%', onAction: () => {
            this.appService.hexDebugger.pause();
            this.refreshState();
          }})
        ProteusClassicBtn({ label: '↷ 单步', widthVal: '23%', onAction: () => {
            this.appService.hexDebugger.step();
            this.refreshState();
          }})
        ProteusClassicBtn({ label: '↺ 复位', widthVal: '23%', onAction: () => {
            this.appService.hexDebugger.reset();
            this.refreshState();
          }})
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 4 })
      .justifyContent(FlexAlign.SpaceBetween)

      Column() {
        ProteusClassicBtn({
          label: '加载示例 HEX',
          widthVal: '100%',
          onAction: () => {
            const sampleHex = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
            const encoder = new util.TextEncoder();
            const data = encoder.encodeInto(sampleHex);
            traceBurn('UI_BURN_BEGIN', `source=mcu_panel_sample family=${this.mcuFamily} bytes=${data.length}`);
            const result = this.appService.hexDebugger.loadHexData(data, this.mcuFamily);
            if (result.success && result.data !== undefined) {
              const fam = this.mcuFamily === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
              this.appService.loadMcuIntoSim(result.data.data, 0, fam);
              this.statusMessage = 'HEX 加载成功';
              this.refreshFirmwareInfo();
            } else {
              this.statusMessage = `加载失败: ${result.error}`;
              traceBurn('UI_BURN_FAIL', `source=mcu_panel_sample err=${result.error}`);
            }
            this.refreshState();
          }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8, top: 4 })

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%').margin({ top: 4 })

      Text('寄存器组')
        .fontSize(ProteusFonts.TITLE)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .margin({ left: 8, top: 4 })
        .alignSelf(ItemAlign.Start)

      Column({ space: 2 }) {
        ForEach(this.registers, (reg: string) => {
          Text(reg)
            .fontSize(ProteusFonts.PARAM_KEY)
            .fontColor(ProteusColors.TEXT_PRIMARY)
            .fontFamily('monospace')
            .width('100%')
            .padding({ top: 2, bottom: 2 })
        }, (reg: string) => reg)
      }
      .width('100%')
      .padding({ left: 8, right: 8 })
      .alignItems(HorizontalAlign.Start)

      Divider().color(ProteusColors.DIVIDER).height(1).width('100%')

      Text('UART 输出')
        .fontSize(ProteusFonts.TITLE)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .margin({ left: 8, top: 4 })
        .alignSelf(ItemAlign.Start)

      Column() {
        Text(this.uartOutput || '(无输出)')
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .fontFamily('monospace')
          .width('100%')
          .height(56)
          .backgroundColor(ProteusColors.INPUT_READONLY_BG)
          .padding(6)
          .border({ width: 1, color: ProteusColors.DIVIDER })
          .borderRadius(0)
      }
      .width('100%')
      .padding({ left: 8, right: 8 })

      Text('UART 发送')
        .fontSize(ProteusFonts.TITLE)
        .fontColor(ProteusColors.TEXT_LABEL)
        .fontWeight(FontWeight.Medium)
        .margin({ left: 8, top: 4 })
        .alignSelf(ItemAlign.Start)

      Row({ space: 4 }) {
        TextInput({ placeholder: '输入 UART 数据', text: this.hexInput })
          .layoutWeight(1)
          .height(28)
          .fontSize(ProteusFonts.PARAM_KEY)
          .fontColor(ProteusColors.TEXT_PRIMARY)
          .borderRadius(0)
          .border({ width: 1, color: ProteusColors.INPUT_BORDER })
          .backgroundColor(ProteusColors.CANVAS_BG)
          .onChange((v: string) => { this.hexInput = v; })
        ProteusClassicBtn({
          label: '发送',
          widthVal: 56,
          onAction: () => {
            this.appService.hexDebugger.sendUartInput(this.hexInput);
            this.refreshState();
          }
        })
      }
      .width('100%')
      .padding({ left: 8, right: 8 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(ProteusColors.CANVAS_BG)
    .padding({ bottom: 8 })
  }
}
