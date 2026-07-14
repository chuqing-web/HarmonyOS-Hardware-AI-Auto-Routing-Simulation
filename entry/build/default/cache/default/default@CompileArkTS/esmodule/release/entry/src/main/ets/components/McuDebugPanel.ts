if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface McuDebugPanel_Params {
    statusMessage?: string;
    selectedComponentId?: string;
    debugState?: string;
    pcValue?: string;
    registers?: string[];
    uartOutput?: string;
    hexInput?: string;
    hexFilePath?: string;
    hexDir?: string;
    sandboxHexFiles?: string[];
    mcuFamily?: McuFamily;
    mcuLabel?: string;
    fwSegmentInfo?: string;
    fwEntryAddr?: string;
    fwTotalSize?: string;
    autoRefreshTimer?: number;
    appService?: AppService;
}
import util from "@ohos:util";
import fs from "@ohos:file.fs";
import picker from "@ohos:file.picker";
import { AppService } from "@bundle:com.elecdraw.aischsim/entry/ets/services/AppService";
import { McuFamily, SimulationState } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusSectionTitle } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
export class McuDebugPanel extends ViewPU {
    constructor(m102, n102, o102, p102 = -1, q102 = undefined, r102) {
        super(m102, o102, p102, r102);
        if (typeof q102 === "function") {
            this.paramsGenerator_ = q102;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(n102.statusMessage, this, "statusMessage");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(n102.selectedComponentId, this, "selectedComponentId");
        this.__debugState = new ObservedPropertySimplePU('reset', this, "debugState");
        this.__pcValue = new ObservedPropertySimplePU('0x0000', this, "pcValue");
        this.__registers = new ObservedPropertyObjectPU([], this, "registers");
        this.__uartOutput = new ObservedPropertySimplePU('', this, "uartOutput");
        this.__hexInput = new ObservedPropertySimplePU('', this, "hexInput");
        this.__hexFilePath = new ObservedPropertySimplePU('', this, "hexFilePath");
        this.__hexDir = new ObservedPropertySimplePU('', this, "hexDir");
        this.__sandboxHexFiles = new ObservedPropertyObjectPU([], this, "sandboxHexFiles");
        this.__mcuFamily = new ObservedPropertySimplePU(McuFamily.MCU_8051, this, "mcuFamily");
        this.__mcuLabel = new ObservedPropertySimplePU('', this, "mcuLabel");
        this.__fwSegmentInfo = new ObservedPropertySimplePU('', this, "fwSegmentInfo");
        this.__fwEntryAddr = new ObservedPropertySimplePU('0x0000', this, "fwEntryAddr");
        this.__fwTotalSize = new ObservedPropertySimplePU('', this, "fwTotalSize");
        this.autoRefreshTimer = -1;
        this.appService = AppService.getInstance();
        this.setInitiallyProvidedValue(n102);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(l102: McuDebugPanel_Params) {
        if (l102.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (l102.debugState !== undefined) {
            this.debugState = l102.debugState;
        }
        if (l102.pcValue !== undefined) {
            this.pcValue = l102.pcValue;
        }
        if (l102.registers !== undefined) {
            this.registers = l102.registers;
        }
        if (l102.uartOutput !== undefined) {
            this.uartOutput = l102.uartOutput;
        }
        if (l102.hexInput !== undefined) {
            this.hexInput = l102.hexInput;
        }
        if (l102.hexFilePath !== undefined) {
            this.hexFilePath = l102.hexFilePath;
        }
        if (l102.hexDir !== undefined) {
            this.hexDir = l102.hexDir;
        }
        if (l102.sandboxHexFiles !== undefined) {
            this.sandboxHexFiles = l102.sandboxHexFiles;
        }
        if (l102.mcuFamily !== undefined) {
            this.mcuFamily = l102.mcuFamily;
        }
        if (l102.mcuLabel !== undefined) {
            this.mcuLabel = l102.mcuLabel;
        }
        if (l102.fwSegmentInfo !== undefined) {
            this.fwSegmentInfo = l102.fwSegmentInfo;
        }
        if (l102.fwEntryAddr !== undefined) {
            this.fwEntryAddr = l102.fwEntryAddr;
        }
        if (l102.fwTotalSize !== undefined) {
            this.fwTotalSize = l102.fwTotalSize;
        }
        if (l102.autoRefreshTimer !== undefined) {
            this.autoRefreshTimer = l102.autoRefreshTimer;
        }
        if (l102.appService !== undefined) {
            this.appService = l102.appService;
        }
    }
    updateStateVars(k102: McuDebugPanel_Params) {
        this.__selectedComponentId.reset(k102.selectedComponentId);
    }
    purgeVariableDependenciesOnElmtId(j102) {
        this.__statusMessage.purgeDependencyOnElmtId(j102);
        this.__selectedComponentId.purgeDependencyOnElmtId(j102);
        this.__debugState.purgeDependencyOnElmtId(j102);
        this.__pcValue.purgeDependencyOnElmtId(j102);
        this.__registers.purgeDependencyOnElmtId(j102);
        this.__uartOutput.purgeDependencyOnElmtId(j102);
        this.__hexInput.purgeDependencyOnElmtId(j102);
        this.__hexFilePath.purgeDependencyOnElmtId(j102);
        this.__hexDir.purgeDependencyOnElmtId(j102);
        this.__sandboxHexFiles.purgeDependencyOnElmtId(j102);
        this.__mcuFamily.purgeDependencyOnElmtId(j102);
        this.__mcuLabel.purgeDependencyOnElmtId(j102);
        this.__fwSegmentInfo.purgeDependencyOnElmtId(j102);
        this.__fwEntryAddr.purgeDependencyOnElmtId(j102);
        this.__fwTotalSize.purgeDependencyOnElmtId(j102);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__debugState.aboutToBeDeleted();
        this.__pcValue.aboutToBeDeleted();
        this.__registers.aboutToBeDeleted();
        this.__uartOutput.aboutToBeDeleted();
        this.__hexInput.aboutToBeDeleted();
        this.__hexFilePath.aboutToBeDeleted();
        this.__hexDir.aboutToBeDeleted();
        this.__sandboxHexFiles.aboutToBeDeleted();
        this.__mcuFamily.aboutToBeDeleted();
        this.__mcuLabel.aboutToBeDeleted();
        this.__fwSegmentInfo.aboutToBeDeleted();
        this.__fwEntryAddr.aboutToBeDeleted();
        this.__fwTotalSize.aboutToBeDeleted();
        SubscriberManager.Get().delete(this.id__());
        this.aboutToBeDeletedInternal();
    }
    private __statusMessage: SynchedPropertySimpleTwoWayPU<string>;
    get statusMessage() {
        return this.__statusMessage.get();
    }
    set statusMessage(i102: string) {
        this.__statusMessage.set(i102);
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(h102: string) {
        this.__selectedComponentId.set(h102);
    }
    private __debugState: ObservedPropertySimplePU<string>;
    get debugState() {
        return this.__debugState.get();
    }
    set debugState(g102: string) {
        this.__debugState.set(g102);
    }
    private __pcValue: ObservedPropertySimplePU<string>;
    get pcValue() {
        return this.__pcValue.get();
    }
    set pcValue(f102: string) {
        this.__pcValue.set(f102);
    }
    private __registers: ObservedPropertyObjectPU<string[]>;
    get registers() {
        return this.__registers.get();
    }
    set registers(e102: string[]) {
        this.__registers.set(e102);
    }
    private __uartOutput: ObservedPropertySimplePU<string>;
    get uartOutput() {
        return this.__uartOutput.get();
    }
    set uartOutput(d102: string) {
        this.__uartOutput.set(d102);
    }
    private __hexInput: ObservedPropertySimplePU<string>;
    get hexInput() {
        return this.__hexInput.get();
    }
    set hexInput(c102: string) {
        this.__hexInput.set(c102);
    }
    private __hexFilePath: ObservedPropertySimplePU<string>;
    get hexFilePath() {
        return this.__hexFilePath.get();
    }
    set hexFilePath(b102: string) {
        this.__hexFilePath.set(b102);
    }
    private __hexDir: ObservedPropertySimplePU<string>;
    get hexDir() {
        return this.__hexDir.get();
    }
    set hexDir(a102: string) {
        this.__hexDir.set(a102);
    }
    private __sandboxHexFiles: ObservedPropertyObjectPU<string[]>;
    get sandboxHexFiles() {
        return this.__sandboxHexFiles.get();
    }
    set sandboxHexFiles(z101: string[]) {
        this.__sandboxHexFiles.set(z101);
    }
    private __mcuFamily: ObservedPropertySimplePU<McuFamily>;
    get mcuFamily() {
        return this.__mcuFamily.get();
    }
    set mcuFamily(y101: McuFamily) {
        this.__mcuFamily.set(y101);
    }
    private __mcuLabel: ObservedPropertySimplePU<string>;
    get mcuLabel() {
        return this.__mcuLabel.get();
    }
    set mcuLabel(x101: string) {
        this.__mcuLabel.set(x101);
    }
    private __fwSegmentInfo: ObservedPropertySimplePU<string>;
    get fwSegmentInfo() {
        return this.__fwSegmentInfo.get();
    }
    set fwSegmentInfo(w101: string) {
        this.__fwSegmentInfo.set(w101);
    }
    private __fwEntryAddr: ObservedPropertySimplePU<string>;
    get fwEntryAddr() {
        return this.__fwEntryAddr.get();
    }
    set fwEntryAddr(v101: string) {
        this.__fwEntryAddr.set(v101);
    }
    private __fwTotalSize: ObservedPropertySimplePU<string>;
    get fwTotalSize() {
        return this.__fwTotalSize.get();
    }
    set fwTotalSize(u101: string) {
        this.__fwTotalSize.set(u101);
    }
    private autoRefreshTimer: number;
    private appService: AppService;
    aboutToAppear(): void {
        this.hexDir = this.appService.getHexDir();
        this.sandboxHexFiles = this.appService.listHexFiles();
        if (this.sandboxHexFiles.length > 0) {
            this.hexFilePath = this.sandboxHexFiles[0];
        }
        this.detectMcu();
        const t101 = this.getFamily();
        this.appService.hexDebugger.configure({
            mcuFamily: t101,
            crystalFreq: t101 === McuFamily.MCU_8051 ? 11059200 : 8000000,
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
        const p101 = this.appService.schematicEditor.getDocument();
        const q101 = p101.components.find(s101 => s101.id === this.selectedComponentId);
        if (q101) {
            const r101 = q101.libraryId.toUpperCase();
            if (r101.startsWith('AT89') || r101.startsWith('STC') || r101.startsWith('8051')) {
                this.mcuFamily = McuFamily.MCU_8051;
                this.mcuLabel = `${q101.refDes} (8051)`;
            }
            else if (r101.startsWith('STM32')) {
                this.mcuFamily = McuFamily.MCU_STM32F1;
                this.mcuLabel = `${q101.refDes} (STM32)`;
            }
        }
    }
    private getFamily(): McuFamily {
        if (this.selectedComponentId.length === 0)
            return McuFamily.MCU_8051;
        const l101 = this.appService.schematicEditor.getDocument();
        const m101 = l101.components.find(o101 => o101.id === this.selectedComponentId);
        if (m101) {
            const n101 = m101.libraryId.toUpperCase();
            if (n101.startsWith('AT89') || n101.startsWith('STC') || n101.startsWith('8051')) {
                return McuFamily.MCU_8051;
            }
            else if (n101.startsWith('STM32')) {
                return McuFamily.MCU_STM32F1;
            }
        }
        return McuFamily.MCU_8051;
    }
    refreshState(): void {
        const w100 = this.appService.simulationKernel;
        const x100 = w100.getState();
        const y100 = w100.getMcuSnapshot();
        if (y100 !== null &&
            (x100 === SimulationState.RUNNING || x100 === SimulationState.PAUSED)) {
            this.debugState = 'running';
            const g101 = y100.registers.get('PC');
            const h101 = g101 !== undefined ? g101 : 0;
            this.pcValue = `0x${h101.toString(16).toUpperCase().padStart(4, '0')}`;
            const i101: string[] = [];
            y100.registers.forEach((j101: number, k101: string) => {
                i101.push(`${k101}: 0x${j101.toString(16).toUpperCase().padStart(2, '0')}`);
            });
            this.registers = i101;
            this.uartOutput = this.appService.hexDebugger.getUartOutput();
            return;
        }
        const z100 = this.appService.hexDebugger.getDebugState();
        this.debugState = z100;
        const a101 = this.appService.hexDebugger.getRegisterSnapshot();
        if (a101) {
            const b101 = a101.registers.get('PC');
            const c101 = b101 !== undefined ? b101 : 0;
            this.pcValue = `0x${c101.toString(16).toUpperCase().padStart(4, '0')}`;
            const d101: string[] = [];
            a101.registers.forEach((e101: number, f101: string) => {
                d101.push(`${f101}: 0x${e101.toString(16).toUpperCase().padStart(2, '0')}`);
            });
            this.registers = d101;
        }
        this.uartOutput = this.appService.hexDebugger.getUartOutput();
    }
    refreshFirmwareInfo(): void {
        const v100 = this.appService.hexDebugger.getParsedHexInfo();
        if (v100) {
            this.fwSegmentInfo = `${v100.flashSegments.length} 段, ${v100.totalByteSize} bytes`;
            this.fwEntryAddr = `0x${v100.minAddr.toString(16).toUpperCase().padStart(4, '0')}`;
            this.fwTotalSize = `${(v100.totalByteSize / 1024).toFixed(1)} KB`;
        }
        else {
            this.fwSegmentInfo = '';
            this.fwEntryAddr = '0x0000';
            this.fwTotalSize = '';
        }
    }
    async browseHexFile(): Promise<void> {
        try {
            const s100 = new picker.DocumentSelectOptions();
            s100.maxSelectNumber = 1;
            s100.fileSuffixFilters = ['.hex', '.HEX', '.bin', '.BIN'];
            const t100 = new picker.DocumentViewPicker();
            const u100 = await t100.select(s100);
            if (u100 && u100.length > 0) {
                this.hexFilePath = u100[0];
                return;
            }
        }
        catch (r100) {
        }
        const q100 = this.appService.listHexFiles();
        this.sandboxHexFiles = q100;
        if (q100.length > 0) {
            this.hexFilePath = q100[0];
            this.statusMessage = `已选用沙箱固件: ${q100[0]}`;
        }
        else {
            this.statusMessage = `沙箱固件目录为空: ${this.hexDir}`;
        }
    }
    async burnHex(): Promise<void> {
        const i100 = this.hexFilePath.trim();
        if (i100.length === 0) {
            this.statusMessage = '请选择或输入 HEX 文件路径';
            return;
        }
        try {
            const k100 = fs.openSync(i100, fs.OpenMode.READ_ONLY);
            const l100 = fs.statSync(i100);
            const m100 = new ArrayBuffer(l100.size);
            fs.readSync(k100.fd, m100);
            fs.closeSync(k100);
            const n100 = new Uint8Array(m100);
            const o100 = this.appService.hexDebugger.loadHexData(n100, this.mcuFamily);
            if (o100.success) {
                const p100 = this.mcuFamily === McuFamily.MCU_8051 ? '8051' : 'STM32F1';
                this.appService.simulationKernel.loadMcuProgram(new Uint8Array(m100), 0, p100);
                this.refreshFirmwareInfo();
                this.statusMessage = `HEX 烧录成功 (${this.fwTotalSize})`;
                this.refreshState();
            }
            else {
                this.statusMessage = `HEX 加载失败: ${o100.error ?? '未知错误'}`;
            }
        }
        catch (j100) {
            this.statusMessage = `烧录失败: ${j100}`;
        }
    }
    initialRender() {
        this.observeComponentCreation2((g100, h100) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.height('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.padding({ bottom: 8 });
        }, Column);
        {
            this.observeComponentCreation2((c100, d100) => {
                if (d100) {
                    let e100 = new ProteusSectionTitle(this, { title: 'MCU 调试' }, undefined, c100, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 213, col: 7 });
                    ViewPU.create(e100);
                    let f100 = () => {
                        return {
                            title: 'MCU 调试'
                        };
                    };
                    e100.paramsGenerator_ = f100;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(c100, {
                        title: 'MCU 调试'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((a100, b100) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((y99, z99) => {
            Text.create(`状态: ${this.debugState}`);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((w99, x99) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((u99, v99) => {
            Text.create(`PC: ${this.pcValue}`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((s99, t99) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((q99, r99) => {
            Text.create('目标芯片:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((o99, p99) => {
            Text.create(this.mcuLabel || '点击画布中 MCU 芯片选择');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.mcuLabel ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY);
            Text.margin({ left: 4 });
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((y98, z98) => {
            If.create();
            if (this.fwSegmentInfo.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((m99, n99) => {
                        Column.create();
                        Column.width('92%');
                        Column.padding(4);
                        Column.backgroundColor('#0a2a0a');
                        Column.border({ width: 1, color: '#30a030' });
                        Column.margin({ left: 8, right: 8, top: 4 });
                    }, Column);
                    this.observeComponentCreation2((k99, l99) => {
                        Row.create();
                    }, Row);
                    this.observeComponentCreation2((i99, j99) => {
                        Text.create('固件:');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(32);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((g99, h99) => {
                        Text.create(`${this.fwSegmentInfo}`);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_OK);
                        Text.layoutWeight(1);
                        Text.maxLines(1);
                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                    }, Text);
                    Text.pop();
                    Row.pop();
                    this.observeComponentCreation2((e99, f99) => {
                        Row.create();
                    }, Row);
                    this.observeComponentCreation2((c99, d99) => {
                        Text.create('入口:');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(32);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((a99, b99) => {
                        Text.create(this.fwEntryAddr);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_PRIMARY);
                        Text.fontFamily('monospace');
                    }, Text);
                    Text.pop();
                    Row.pop();
                    Column.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((w98, x98) => {
            Text.create(`固件目录: ${this.hexDir}`);
            Text.fontSize(9);
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            Text.padding({ left: 8, right: 8 });
            Text.width('100%');
            Text.maxLines(2);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((u98, v98) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((r98, s98) => {
            TextInput.create({ placeholder: `${this.hexDir}/lab_51_led.hex`, text: this.hexFilePath });
            TextInput.layoutWeight(1);
            TextInput.height(28);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((t98: string) => { this.hexFilePath = t98; });
        }, TextInput);
        {
            this.observeComponentCreation2((n98, o98) => {
                if (o98) {
                    let p98 = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: 50,
                        onAction: () => { void this.browseHexFile(); }
                    }, undefined, n98, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 294, col: 9 });
                    ViewPU.create(p98);
                    let q98 = () => {
                        return {
                            label: '浏览',
                            widthVal: 50,
                            onAction: () => { void this.browseHexFile(); }
                        };
                    };
                    p98.paramsGenerator_ = q98;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n98, {
                        label: '浏览',
                        widthVal: 50
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((j98, k98) => {
                if (k98) {
                    let l98 = new ProteusClassicBtn(this, {
                        label: '烧录',
                        widthVal: 50,
                        onAction: () => { void this.burnHex(); }
                    }, undefined, j98, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 299, col: 9 });
                    ViewPU.create(l98);
                    let m98 = () => {
                        return {
                            label: '烧录',
                            widthVal: 50,
                            onAction: () => { void this.burnHex(); }
                        };
                    };
                    l98.paramsGenerator_ = m98;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j98, {
                        label: '烧录',
                        widthVal: 50
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((t97, u97) => {
            If.create();
            if (this.sandboxHexFiles.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((h98, i98) => {
                        Scroll.create();
                        Scroll.scrollable(ScrollDirection.Horizontal);
                        Scroll.scrollBar(BarState.Off);
                        Scroll.width('100%');
                        Scroll.height(32);
                    }, Scroll);
                    this.observeComponentCreation2((f98, g98) => {
                        Row.create({ space: 4 });
                        Row.padding({ left: 8, right: 8 });
                    }, Row);
                    this.observeComponentCreation2((v97, w97) => {
                        ForEach.create();
                        const x97 = z97 => {
                            const a98 = z97;
                            {
                                this.observeComponentCreation2((b98, c98) => {
                                    if (c98) {
                                        let d98 = new ProteusClassicBtn(this, {
                                            label: a98.substring(a98.lastIndexOf('/') + 1),
                                            widthVal: 100,
                                            onAction: () => {
                                                this.hexFilePath = a98;
                                                void this.burnHex();
                                            }
                                        }, undefined, b98, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 312, col: 15 });
                                        ViewPU.create(d98);
                                        let e98 = () => {
                                            return {
                                                label: a98.substring(a98.lastIndexOf('/') + 1),
                                                widthVal: 100,
                                                onAction: () => {
                                                    this.hexFilePath = a98;
                                                    void this.burnHex();
                                                }
                                            };
                                        };
                                        d98.paramsGenerator_ = e98;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(b98, {
                                            label: a98.substring(a98.lastIndexOf('/') + 1),
                                            widthVal: 100
                                        });
                                    }
                                }, { name: "ProteusClassicBtn" });
                            }
                        };
                        this.forEachUpdateFunction(v97, this.sandboxHexFiles, x97, (y97: string) => y97, false, false);
                    }, ForEach);
                    ForEach.pop();
                    Row.pop();
                    Scroll.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((r97, s97) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8 });
            Row.justifyContent(FlexAlign.SpaceBetween);
        }, Row);
        {
            this.observeComponentCreation2((n97, o97) => {
                if (o97) {
                    let p97 = new ProteusClassicBtn(this, { label: '▶ 运行', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.run();
                            this.refreshState();
                        } }, undefined, n97, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 331, col: 9 });
                    ViewPU.create(p97);
                    let q97 = () => {
                        return {
                            label: '▶ 运行',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.run();
                                this.refreshState();
                            }
                        };
                    };
                    p97.paramsGenerator_ = q97;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n97, {
                        label: '▶ 运行', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((j97, k97) => {
                if (k97) {
                    let l97 = new ProteusClassicBtn(this, { label: '⏸ 暂停', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.pause();
                            this.refreshState();
                        } }, undefined, j97, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 335, col: 9 });
                    ViewPU.create(l97);
                    let m97 = () => {
                        return {
                            label: '⏸ 暂停',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.pause();
                                this.refreshState();
                            }
                        };
                    };
                    l97.paramsGenerator_ = m97;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(j97, {
                        label: '⏸ 暂停', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((f97, g97) => {
                if (g97) {
                    let h97 = new ProteusClassicBtn(this, { label: '↷ 单步', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.step();
                            this.refreshState();
                        } }, undefined, f97, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 339, col: 9 });
                    ViewPU.create(h97);
                    let i97 = () => {
                        return {
                            label: '↷ 单步',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.step();
                                this.refreshState();
                            }
                        };
                    };
                    h97.paramsGenerator_ = i97;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(f97, {
                        label: '↷ 单步', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((b97, c97) => {
                if (c97) {
                    let d97 = new ProteusClassicBtn(this, { label: '↺ 复位', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.reset();
                            this.refreshState();
                        } }, undefined, b97, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 343, col: 9 });
                    ViewPU.create(d97);
                    let e97 = () => {
                        return {
                            label: '↺ 复位',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.reset();
                                this.refreshState();
                            }
                        };
                    };
                    d97.paramsGenerator_ = e97;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(b97, {
                        label: '↺ 复位', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((z96, a97) => {
            __Common__.create();
            __Common__.margin({ left: 8 });
        }, __Common__);
        {
            this.observeComponentCreation2((n96, o96) => {
                if (o96) {
                    let p96 = new ProteusClassicBtn(this, {
                        label: '加载示例 HEX',
                        widthVal: '92%',
                        onAction: () => {
                            const v96 = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
                            const w96 = new util.TextEncoder();
                            const x96 = w96.encodeInto(v96);
                            const y96 = this.appService.hexDebugger.loadHexData(x96, this.mcuFamily);
                            this.statusMessage = y96.success ? 'HEX 加载成功' : `加载失败: ${y96.error}`;
                            this.refreshState();
                        }
                    }, undefined, n96, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 352, col: 7 });
                    ViewPU.create(p96);
                    let q96 = () => {
                        return {
                            label: '加载示例 HEX',
                            widthVal: '92%',
                            onAction: () => {
                                const r96 = ':100000000074012280020322D2DC8F9F0A\n:00000001FF\n';
                                const s96 = new util.TextEncoder();
                                const t96 = s96.encodeInto(r96);
                                const u96 = this.appService.hexDebugger.loadHexData(t96, this.mcuFamily);
                                this.statusMessage = u96.success ? 'HEX 加载成功' : `加载失败: ${u96.error}`;
                                this.refreshState();
                            }
                        };
                    };
                    p96.paramsGenerator_ = q96;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(n96, {
                        label: '加载示例 HEX',
                        widthVal: '92%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        __Common__.pop();
        this.observeComponentCreation2((l96, m96) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
            Divider.margin({ top: 4 });
        }, Divider);
        this.observeComponentCreation2((j96, k96) => {
            Text.create('寄存器组');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ left: 8, top: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((h96, i96) => {
            Column.create({ space: 2 });
            Column.width('100%');
            Column.padding({ left: 8, right: 8 });
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((z95, a96) => {
            ForEach.create();
            const b96 = d96 => {
                const e96 = d96;
                this.observeComponentCreation2((f96, g96) => {
                    Text.create(e96);
                    Text.fontSize(ProteusFonts.PARAM_KEY);
                    Text.fontColor(ProteusColors.TEXT_PRIMARY);
                    Text.fontFamily('monospace');
                    Text.width('100%');
                    Text.padding({ top: 2, bottom: 2 });
                }, Text);
                Text.pop();
            };
            this.forEachUpdateFunction(z95, this.registers, b96, (c96: string) => c96, false, false);
        }, ForEach);
        ForEach.pop();
        Column.pop();
        this.observeComponentCreation2((x95, y95) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
        }, Divider);
        this.observeComponentCreation2((v95, w95) => {
            Text.create('UART 输出');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ left: 8, top: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((t95, u95) => {
            Text.create(this.uartOutput || '(无输出)');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontFamily('monospace');
            Text.width('92%');
            Text.height(56);
            Text.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Text.padding(6);
            Text.border({ width: 1, color: ProteusColors.DIVIDER });
            Text.borderRadius(0);
            Text.margin({ left: 8 });
        }, Text);
        Text.pop();
        this.observeComponentCreation2((r95, s95) => {
            Text.create('UART 发送');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.margin({ left: 8, top: 4 });
            Text.alignSelf(ItemAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((p95, q95) => {
            Row.create();
            Row.width('92%');
            Row.margin({ left: 8 });
        }, Row);
        this.observeComponentCreation2((m95, n95) => {
            TextInput.create({ placeholder: '输入 UART 数据', text: this.hexInput });
            TextInput.layoutWeight(1);
            TextInput.height(28);
            TextInput.fontSize(ProteusFonts.PARAM_KEY);
            TextInput.fontColor(ProteusColors.TEXT_PRIMARY);
            TextInput.borderRadius(0);
            TextInput.border({ width: 1, color: ProteusColors.INPUT_BORDER });
            TextInput.backgroundColor(ProteusColors.CANVAS_BG);
            TextInput.onChange((o95: string) => { this.hexInput = o95; });
        }, TextInput);
        {
            this.observeComponentCreation2((i95, j95) => {
                if (j95) {
                    let k95 = new ProteusClassicBtn(this, {
                        label: '发送',
                        widthVal: 56,
                        onAction: () => {
                            this.appService.hexDebugger.sendUartInput(this.hexInput);
                            this.refreshState();
                        }
                    }, undefined, i95, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 427, col: 9 });
                    ViewPU.create(k95);
                    let l95 = () => {
                        return {
                            label: '发送',
                            widthVal: 56,
                            onAction: () => {
                                this.appService.hexDebugger.sendUartInput(this.hexInput);
                                this.refreshState();
                            }
                        };
                    };
                    k95.paramsGenerator_ = l95;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(i95, {
                        label: '发送',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
