if (!("finalizeConstruction" in ViewPU.prototype)) {
    Reflect.set(ViewPU.prototype, "finalizeConstruction", () => { });
}
interface McuDebugPanel_Params {
    statusMessage?: string;
    selectedComponentId?: string;
    debugState?: string;
    pcValue?: string;
    regEntries?: McuRegEntry[];
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
import { McuFamily, SimulationState, traceBurn, formatFirmwarePreview } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { ProteusClassicBtn, ProteusSectionTitle, ProteusTextInput } from "@bundle:com.elecdraw.aischsim/entry/ets/components/proteus/ProteusWidgets";
import { ProteusColors, ProteusFonts } from "@bundle:com.elecdraw.aischsim/entry/ets/theme/ProteusTheme";
/** 寄存器行：名称与值拆开，便于窄栏双列对齐 */
interface McuRegEntry {
    name: string;
    valueHex: string;
}
const MCU_REG_PRIORITY: string[] = ['PC', 'ACC', 'B', 'PSW', 'SP', 'DPTR', 'P0', 'P1', 'P2', 'P3'];
export class McuDebugPanel extends ViewPU {
    constructor(parent, params, __localStorage, elmtId = -1, paramsLambda = undefined, extraInfo) {
        super(parent, __localStorage, elmtId, extraInfo);
        if (typeof paramsLambda === "function") {
            this.paramsGenerator_ = paramsLambda;
        }
        this.__statusMessage = new SynchedPropertySimpleTwoWayPU(params.statusMessage, this, "statusMessage");
        this.__selectedComponentId = new SynchedPropertySimpleOneWayPU(params.selectedComponentId, this, "selectedComponentId");
        this.__debugState = new ObservedPropertySimplePU('reset', this, "debugState");
        this.__pcValue = new ObservedPropertySimplePU('0x0000', this, "pcValue");
        this.__regEntries = new ObservedPropertyObjectPU([], this, "regEntries");
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
        this.setInitiallyProvidedValue(params);
        this.declareWatch("selectedComponentId", this.onSelectionChange);
        this.finalizeConstruction();
    }
    setInitiallyProvidedValue(params: McuDebugPanel_Params) {
        if (params.selectedComponentId === undefined) {
            this.__selectedComponentId.set('');
        }
        if (params.debugState !== undefined) {
            this.debugState = params.debugState;
        }
        if (params.pcValue !== undefined) {
            this.pcValue = params.pcValue;
        }
        if (params.regEntries !== undefined) {
            this.regEntries = params.regEntries;
        }
        if (params.uartOutput !== undefined) {
            this.uartOutput = params.uartOutput;
        }
        if (params.hexInput !== undefined) {
            this.hexInput = params.hexInput;
        }
        if (params.hexFilePath !== undefined) {
            this.hexFilePath = params.hexFilePath;
        }
        if (params.hexDir !== undefined) {
            this.hexDir = params.hexDir;
        }
        if (params.sandboxHexFiles !== undefined) {
            this.sandboxHexFiles = params.sandboxHexFiles;
        }
        if (params.mcuFamily !== undefined) {
            this.mcuFamily = params.mcuFamily;
        }
        if (params.mcuLabel !== undefined) {
            this.mcuLabel = params.mcuLabel;
        }
        if (params.fwSegmentInfo !== undefined) {
            this.fwSegmentInfo = params.fwSegmentInfo;
        }
        if (params.fwEntryAddr !== undefined) {
            this.fwEntryAddr = params.fwEntryAddr;
        }
        if (params.fwTotalSize !== undefined) {
            this.fwTotalSize = params.fwTotalSize;
        }
        if (params.autoRefreshTimer !== undefined) {
            this.autoRefreshTimer = params.autoRefreshTimer;
        }
        if (params.appService !== undefined) {
            this.appService = params.appService;
        }
    }
    updateStateVars(params: McuDebugPanel_Params) {
        this.__selectedComponentId.reset(params.selectedComponentId);
    }
    purgeVariableDependenciesOnElmtId(rmElmtId) {
        this.__statusMessage.purgeDependencyOnElmtId(rmElmtId);
        this.__selectedComponentId.purgeDependencyOnElmtId(rmElmtId);
        this.__debugState.purgeDependencyOnElmtId(rmElmtId);
        this.__pcValue.purgeDependencyOnElmtId(rmElmtId);
        this.__regEntries.purgeDependencyOnElmtId(rmElmtId);
        this.__uartOutput.purgeDependencyOnElmtId(rmElmtId);
        this.__hexInput.purgeDependencyOnElmtId(rmElmtId);
        this.__hexFilePath.purgeDependencyOnElmtId(rmElmtId);
        this.__hexDir.purgeDependencyOnElmtId(rmElmtId);
        this.__sandboxHexFiles.purgeDependencyOnElmtId(rmElmtId);
        this.__mcuFamily.purgeDependencyOnElmtId(rmElmtId);
        this.__mcuLabel.purgeDependencyOnElmtId(rmElmtId);
        this.__fwSegmentInfo.purgeDependencyOnElmtId(rmElmtId);
        this.__fwEntryAddr.purgeDependencyOnElmtId(rmElmtId);
        this.__fwTotalSize.purgeDependencyOnElmtId(rmElmtId);
    }
    aboutToBeDeleted() {
        this.__statusMessage.aboutToBeDeleted();
        this.__selectedComponentId.aboutToBeDeleted();
        this.__debugState.aboutToBeDeleted();
        this.__pcValue.aboutToBeDeleted();
        this.__regEntries.aboutToBeDeleted();
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
    set statusMessage(newValue: string) {
        this.__statusMessage.set(newValue);
    }
    private __selectedComponentId: SynchedPropertySimpleOneWayPU<string>;
    get selectedComponentId() {
        return this.__selectedComponentId.get();
    }
    set selectedComponentId(newValue: string) {
        this.__selectedComponentId.set(newValue);
    }
    private __debugState: ObservedPropertySimplePU<string>;
    get debugState() {
        return this.__debugState.get();
    }
    set debugState(newValue: string) {
        this.__debugState.set(newValue);
    }
    private __pcValue: ObservedPropertySimplePU<string>;
    get pcValue() {
        return this.__pcValue.get();
    }
    set pcValue(newValue: string) {
        this.__pcValue.set(newValue);
    }
    private __regEntries: ObservedPropertyObjectPU<McuRegEntry[]>;
    get regEntries() {
        return this.__regEntries.get();
    }
    set regEntries(newValue: McuRegEntry[]) {
        this.__regEntries.set(newValue);
    }
    private __uartOutput: ObservedPropertySimplePU<string>;
    get uartOutput() {
        return this.__uartOutput.get();
    }
    set uartOutput(newValue: string) {
        this.__uartOutput.set(newValue);
    }
    private __hexInput: ObservedPropertySimplePU<string>;
    get hexInput() {
        return this.__hexInput.get();
    }
    set hexInput(newValue: string) {
        this.__hexInput.set(newValue);
    }
    private __hexFilePath: ObservedPropertySimplePU<string>;
    get hexFilePath() {
        return this.__hexFilePath.get();
    }
    set hexFilePath(newValue: string) {
        this.__hexFilePath.set(newValue);
    }
    private __hexDir: ObservedPropertySimplePU<string>;
    get hexDir() {
        return this.__hexDir.get();
    }
    set hexDir(newValue: string) {
        this.__hexDir.set(newValue);
    }
    private __sandboxHexFiles: ObservedPropertyObjectPU<string[]>;
    get sandboxHexFiles() {
        return this.__sandboxHexFiles.get();
    }
    set sandboxHexFiles(newValue: string[]) {
        this.__sandboxHexFiles.set(newValue);
    }
    private __mcuFamily: ObservedPropertySimplePU<McuFamily>;
    get mcuFamily() {
        return this.__mcuFamily.get();
    }
    set mcuFamily(newValue: McuFamily) {
        this.__mcuFamily.set(newValue);
    }
    private __mcuLabel: ObservedPropertySimplePU<string>;
    get mcuLabel() {
        return this.__mcuLabel.get();
    }
    set mcuLabel(newValue: string) {
        this.__mcuLabel.set(newValue);
    }
    private __fwSegmentInfo: ObservedPropertySimplePU<string>;
    get fwSegmentInfo() {
        return this.__fwSegmentInfo.get();
    }
    set fwSegmentInfo(newValue: string) {
        this.__fwSegmentInfo.set(newValue);
    }
    private __fwEntryAddr: ObservedPropertySimplePU<string>;
    get fwEntryAddr() {
        return this.__fwEntryAddr.get();
    }
    set fwEntryAddr(newValue: string) {
        this.__fwEntryAddr.set(newValue);
    }
    private __fwTotalSize: ObservedPropertySimplePU<string>;
    get fwTotalSize() {
        return this.__fwTotalSize.get();
    }
    set fwTotalSize(newValue: string) {
        this.__fwTotalSize.set(newValue);
    }
    private autoRefreshTimer: number;
    private appService: AppService;
    private buildRegEntries(regs: Map<string, number>): McuRegEntry[] {
        const entries: McuRegEntry[] = [];
        regs.forEach((value: number, key: string) => {
            const width = (key === 'PC' || key === 'DPTR' || value > 0xFF) ? 4 : 2;
            entries.push({
                name: key,
                valueHex: `0x${value.toString(16).toUpperCase().padStart(width, '0')}`
            });
        });
        entries.sort((a: McuRegEntry, b: McuRegEntry) => {
            const ia = MCU_REG_PRIORITY.indexOf(a.name);
            const ib = MCU_REG_PRIORITY.indexOf(b.name);
            const pa = ia >= 0 ? ia : 100;
            const pb = ib >= 0 ? ib : 100;
            if (pa !== pb) {
                return pa - pb;
            }
            return a.name.localeCompare(b.name);
        });
        return entries;
    }
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
            }
            else if (lib.startsWith('STM32')) {
                this.mcuFamily = McuFamily.MCU_STM32F1;
                this.mcuLabel = `${comp.refDes} (STM32)`;
            }
        }
    }
    private getFamily(): McuFamily {
        if (this.selectedComponentId.length === 0)
            return McuFamily.MCU_8051;
        const doc = this.appService.schematicEditor.getDocument();
        const comp = doc.components.find(c => c.id === this.selectedComponentId);
        if (comp) {
            const lib = comp.libraryId.toUpperCase();
            if (lib.startsWith('AT89') || lib.startsWith('STC') || lib.startsWith('8051')) {
                return McuFamily.MCU_8051;
            }
            else if (lib.startsWith('STM32')) {
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
            this.regEntries = this.buildRegEntries(simSnap.registers);
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
            this.regEntries = this.buildRegEntries(snap.registers);
        }
        this.uartOutput = this.appService.hexDebugger.getUartOutput();
    }
    refreshFirmwareInfo(): void {
        const parsed = this.appService.hexDebugger.getParsedHexInfo();
        if (parsed) {
            this.fwSegmentInfo = `${parsed.flashSegments.length} 段, ${parsed.totalByteSize} bytes`;
            this.fwEntryAddr = `0x${parsed.minAddr.toString(16).toUpperCase().padStart(4, '0')}`;
            this.fwTotalSize = `${(parsed.totalByteSize / 1024).toFixed(1)} KB`;
        }
        else {
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
        }
        catch (_e) {
            // fall through to sandbox list
        }
        const sandbox = this.appService.listHexFiles();
        this.sandboxHexFiles = sandbox;
        if (sandbox.length > 0) {
            this.hexFilePath = sandbox[0];
            this.statusMessage = `已选用沙箱固件: ${sandbox[0]}`;
        }
        else {
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
        traceBurn('UI_BURN_BEGIN', `source=mcu_panel path=${path} family=${familyStr} mcu=${this.mcuLabel || '-'}`);
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
                traceBurn('UI_BURN_OK', `source=mcu_panel path=${path} size=${this.fwTotalSize} segs=${this.fwSegmentInfo} entry=${this.fwEntryAddr}`);
            }
            else {
                this.statusMessage = `HEX 加载失败: ${result.error ?? '未知错误'}`;
                traceBurn('UI_BURN_FAIL', `source=mcu_panel path=${path} err=${result.error ?? 'unknown'}`);
            }
        }
        catch (e) {
            this.statusMessage = `烧录失败: ${e}`;
            traceBurn('UI_BURN_FAIL', `source=mcu_panel path=${path} ex=${e}`);
        }
    }
    initialRender() {
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create({ space: 6 });
            Column.width('100%');
            Column.backgroundColor(ProteusColors.CANVAS_BG);
            Column.padding({ bottom: 8 });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusSectionTitle(this, { title: 'MCU 调试' }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 252, col: 7 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            title: 'MCU 调试'
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        title: 'MCU 调试'
                    });
                }
            }, { name: "ProteusSectionTitle" });
        }
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 6 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`状态: ${this.debugState}`);
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(`PC: ${this.pcValue}`);
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_PRIMARY);
            Text.fontFamily('monospace');
        }, Text);
        Text.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // MCU selection info
            Row.create();
            // MCU selection info
            Row.width('100%');
            // MCU selection info
            Row.padding({ left: 8, right: 8 });
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('目标芯片:');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(ProteusColors.TEXT_LABEL);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.mcuLabel || '点击画布中 MCU 芯片选择');
            Text.fontSize(ProteusFonts.PARAM_KEY);
            Text.fontColor(this.mcuLabel ? ProteusColors.ERC_OK : ProteusColors.TEXT_SECONDARY);
            Text.margin({ left: 4 });
            Text.layoutWeight(1);
            Text.maxLines(1);
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        Text.pop();
        // MCU selection info
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            // Firmware info (shown after successful HEX burn)
            if (this.fwSegmentInfo.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Column.create();
                        Column.width('92%');
                        Column.padding(4);
                        Column.backgroundColor('#0a2a0a');
                        Column.border({ width: 1, color: '#30a030' });
                        Column.margin({ left: 8, right: 8, top: 4 });
                    }, Column);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('固件:');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(32);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create(`${this.fwSegmentInfo}`);
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.ERC_OK);
                        Text.layoutWeight(1);
                        Text.maxLines(1);
                        Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                    }, Text);
                    Text.pop();
                    Row.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Row.create();
                    }, Row);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('入口:');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width(32);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
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
            // HEX burn section — stacked for narrow right panel (~200–420px)
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.create(`固件目录: ${this.hexDir}`);
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.fontSize(9);
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.fontColor(ProteusColors.TEXT_SECONDARY);
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.padding({ left: 8, right: 8 });
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.width('100%');
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.maxLines(2);
            // HEX burn section — stacked for narrow right panel (~200–420px)
            Text.textOverflow({ overflow: TextOverflow.Ellipsis });
        }, Text);
        // HEX burn section — stacked for narrow right panel (~200–420px)
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 8, right: 8 });
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.width('100%');
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: '固件路径…',
                        text: this.hexFilePath,
                        onChange: (v: string) => { this.hexFilePath = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 326, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: '固件路径…',
                            text: this.hexFilePath,
                            onChange: (v: string) => { this.hexFilePath = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: '固件路径…',
                        text: this.hexFilePath
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4 });
            Row.justifyContent(FlexAlign.SpaceBetween);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '浏览',
                        widthVal: '48%',
                        onAction: () => { void this.browseHexFile(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 337, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '浏览',
                            widthVal: '48%',
                            onAction: () => { void this.browseHexFile(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '浏览',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '烧录',
                        widthVal: '48%',
                        onAction: () => { void this.burnHex(); }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 342, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '烧录',
                            widthVal: '48%',
                            onAction: () => { void this.burnHex(); }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '烧录',
                        widthVal: '48%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.sandboxHexFiles.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('沙箱固件（点选即烧录）');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_LABEL);
                        Text.width('100%');
                        Text.padding({ left: 8, right: 8, top: 6, bottom: 2 });
                        Text.alignSelf(ItemAlign.Start);
                    }, Text);
                    Text.pop();
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Flex.create({
                            wrap: FlexWrap.Wrap,
                            justifyContent: FlexAlign.SpaceBetween
                        });
                        Flex.width('100%');
                        Flex.padding({ left: 8, right: 8 });
                    }, Flex);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const hexPath = _item;
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                __Common__.create();
                                __Common__.margin({ bottom: 4 });
                            }, __Common__);
                            {
                                this.observeComponentCreation2((elmtId, isInitialRender) => {
                                    if (isInitialRender) {
                                        let componentCall = new ProteusClassicBtn(this, {
                                            label: this.hexFileName(hexPath),
                                            widthVal: '48%',
                                            tooltip: hexPath,
                                            onAction: () => {
                                                this.hexFilePath = hexPath;
                                                void this.burnHex();
                                            }
                                        }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 365, col: 13 });
                                        ViewPU.create(componentCall);
                                        let paramsLambda = () => {
                                            return {
                                                label: this.hexFileName(hexPath),
                                                widthVal: '48%',
                                                tooltip: hexPath,
                                                onAction: () => {
                                                    this.hexFilePath = hexPath;
                                                    void this.burnHex();
                                                }
                                            };
                                        };
                                        componentCall.paramsGenerator_ = paramsLambda;
                                    }
                                    else {
                                        this.updateStateVarsOfChildByElmtId(elmtId, {
                                            label: this.hexFileName(hexPath),
                                            widthVal: '48%',
                                            tooltip: hexPath
                                        });
                                    }
                                }, { name: "ProteusClassicBtn" });
                            }
                            __Common__.pop();
                        };
                        this.forEachUpdateFunction(elmtId, this.sandboxHexFiles, forEachItemGenFunction, (hexPath: string) => hexPath, false, false);
                    }, ForEach);
                    ForEach.pop();
                    Flex.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
            Row.padding({ left: 8, right: 8, top: 4 });
            Row.justifyContent(FlexAlign.SpaceBetween);
        }, Row);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '▶ 运行', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.run();
                            this.refreshState();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 382, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '▶ 运行',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.run();
                                this.refreshState();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '▶ 运行', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '⏸ 暂停', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.pause();
                            this.refreshState();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 386, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '⏸ 暂停',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.pause();
                                this.refreshState();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '⏸ 暂停', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '↷ 单步', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.step();
                            this.refreshState();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 390, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '↷ 单步',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.step();
                                this.refreshState();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '↷ 单步', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, { label: '↺ 复位', widthVal: '23%', onAction: () => {
                            this.appService.hexDebugger.reset();
                            this.refreshState();
                        } }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 394, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '↺ 复位',
                            widthVal: '23%',
                            onAction: () => {
                                this.appService.hexDebugger.reset();
                                this.refreshState();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '↺ 复位', widthVal: '23%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Column.create();
            Column.width('100%');
            Column.padding({ left: 8, right: 8, top: 4 });
        }, Column);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
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
                            }
                            else {
                                this.statusMessage = `加载失败: ${result.error}`;
                                traceBurn('UI_BURN_FAIL', `source=mcu_panel_sample err=${result.error}`);
                            }
                            this.refreshState();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 404, col: 9 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
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
                                }
                                else {
                                    this.statusMessage = `加载失败: ${result.error}`;
                                    traceBurn('UI_BURN_FAIL', `source=mcu_panel_sample err=${result.error}`);
                                }
                                this.refreshState();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '加载示例 HEX',
                        widthVal: '100%'
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
            Divider.margin({ top: 6, bottom: 2 });
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // 寄存器：双列网格 + 固定最大高度，避免运行时纵向撑爆挤乱 UART
            Column.create({ space: 4 });
            // 寄存器：双列网格 + 固定最大高度，避免运行时纵向撑爆挤乱 UART
            Column.width('100%');
            // 寄存器：双列网格 + 固定最大高度，避免运行时纵向撑爆挤乱 UART
            Column.padding({ left: 8, right: 8, top: 2 });
            // 寄存器：双列网格 + 固定最大高度，避免运行时纵向撑爆挤乱 UART
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('寄存器组');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.width('100%');
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.regEntries.length === 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('(无寄存器数据)');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.width('100%');
                        Text.padding({ top: 4, bottom: 4 });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Scroll.create();
                        Scroll.width('100%');
                        Scroll.constraintSize({ maxHeight: 128 });
                        Scroll.scrollBar(BarState.Auto);
                        Scroll.edgeEffect(EdgeEffect.None);
                    }, Scroll);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Flex.create({
                            wrap: FlexWrap.Wrap,
                            justifyContent: FlexAlign.SpaceBetween
                        });
                        Flex.width('100%');
                    }, Flex);
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        ForEach.create();
                        const forEachItemGenFunction = _item => {
                            const reg = _item;
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Row.create({ space: 2 });
                                Row.width('48%');
                                Row.height(20);
                                Row.padding({ left: 4, right: 4 });
                                Row.backgroundColor(ProteusColors.INPUT_READONLY_BG);
                                Row.border({ width: 1, color: ProteusColors.DIVIDER });
                                Row.margin({ bottom: 3 });
                                Row.alignItems(VerticalAlign.Center);
                            }, Row);
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(reg.name);
                                Text.fontSize(ProteusFonts.STATUS);
                                Text.fontColor(ProteusColors.TEXT_LABEL);
                                Text.width(36);
                                Text.maxLines(1);
                                Text.textOverflow({ overflow: TextOverflow.Ellipsis });
                            }, Text);
                            Text.pop();
                            this.observeComponentCreation2((elmtId, isInitialRender) => {
                                Text.create(reg.valueHex);
                                Text.fontSize(ProteusFonts.STATUS);
                                Text.fontColor(ProteusColors.TEXT_PRIMARY);
                                Text.fontFamily('monospace');
                                Text.layoutWeight(1);
                                Text.maxLines(1);
                                Text.textOverflow({ overflow: TextOverflow.Clip });
                                Text.textAlign(TextAlign.End);
                            }, Text);
                            Text.pop();
                            Row.pop();
                        };
                        this.forEachUpdateFunction(elmtId, this.regEntries, forEachItemGenFunction, (reg: McuRegEntry) => reg.name, false, false);
                    }, ForEach);
                    ForEach.pop();
                    Flex.pop();
                    Scroll.pop();
                });
            }
        }, If);
        If.pop();
        // 寄存器：双列网格 + 固定最大高度，避免运行时纵向撑爆挤乱 UART
        Column.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Divider.create();
            Divider.color(ProteusColors.DIVIDER);
            Divider.height(1);
            Divider.width('100%');
            Divider.margin({ top: 4, bottom: 2 });
        }, Divider);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            // UART：独立滚动视口，与寄存器分区，运行时不再互相挤压错位
            Column.create({ space: 4 });
            // UART：独立滚动视口，与寄存器分区，运行时不再互相挤压错位
            Column.width('100%');
            // UART：独立滚动视口，与寄存器分区，运行时不再互相挤压错位
            Column.padding({ left: 8, right: 8, top: 2 });
            // UART：独立滚动视口，与寄存器分区，运行时不再互相挤压错位
            Column.alignItems(HorizontalAlign.Start);
        }, Column);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create();
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('UART 输出');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Blank.create();
        }, Blank);
        Blank.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            If.create();
            if (this.uartOutput.length > 0) {
                this.ifElseBranchUpdateFunction(0, () => {
                    this.observeComponentCreation2((elmtId, isInitialRender) => {
                        Text.create('清空');
                        Text.fontSize(ProteusFonts.STATUS);
                        Text.fontColor(ProteusColors.TEXT_SECONDARY);
                        Text.padding({ left: 6, right: 6, top: 2, bottom: 2 });
                        Text.onClick(() => {
                            this.appService.hexDebugger.clearUartLog();
                            this.uartOutput = '';
                        });
                    }, Text);
                    Text.pop();
                });
            }
            else {
                this.ifElseBranchUpdateFunction(1, () => {
                });
            }
        }, If);
        If.pop();
        Row.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Scroll.create();
            Scroll.width('100%');
            Scroll.height(96);
            Scroll.padding(6);
            Scroll.backgroundColor(ProteusColors.INPUT_READONLY_BG);
            Scroll.border({ width: 1, color: ProteusColors.DIVIDER });
            Scroll.scrollBar(BarState.Auto);
            Scroll.align(Alignment.TopStart);
            Scroll.edgeEffect(EdgeEffect.None);
        }, Scroll);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create(this.uartOutput.length > 0 ? this.uartOutput : '(无输出)');
            Text.fontSize(ProteusFonts.STATUS);
            Text.fontColor(this.uartOutput.length > 0 ?
                ProteusColors.TEXT_PRIMARY : ProteusColors.TEXT_SECONDARY);
            Text.fontFamily('monospace');
            Text.width('100%');
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        Scroll.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Text.create('UART 发送');
            Text.fontSize(ProteusFonts.TITLE);
            Text.fontColor(ProteusColors.TEXT_LABEL);
            Text.fontWeight(FontWeight.Medium);
            Text.width('100%');
            Text.textAlign(TextAlign.Start);
        }, Text);
        Text.pop();
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            Row.create({ space: 4 });
            Row.width('100%');
        }, Row);
        this.observeComponentCreation2((elmtId, isInitialRender) => {
            __Common__.create();
            __Common__.layoutWeight(1);
        }, __Common__);
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusTextInput(this, {
                        placeholder: '输入 UART 数据',
                        text: this.hexInput,
                        onChange: (v: string) => { this.hexInput = v; }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 539, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            placeholder: '输入 UART 数据',
                            text: this.hexInput,
                            onChange: (v: string) => { this.hexInput = v; }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        placeholder: '输入 UART 数据',
                        text: this.hexInput
                    });
                }
            }, { name: "ProteusTextInput" });
        }
        __Common__.pop();
        {
            this.observeComponentCreation2((elmtId, isInitialRender) => {
                if (isInitialRender) {
                    let componentCall = new ProteusClassicBtn(this, {
                        label: '发送',
                        widthVal: 56,
                        onAction: () => {
                            this.appService.hexDebugger.sendUartInput(this.hexInput);
                            this.refreshState();
                        }
                    }, undefined, elmtId, () => { }, { page: "entry/src/main/ets/components/McuDebugPanel.ets", line: 545, col: 11 });
                    ViewPU.create(componentCall);
                    let paramsLambda = () => {
                        return {
                            label: '发送',
                            widthVal: 56,
                            onAction: () => {
                                this.appService.hexDebugger.sendUartInput(this.hexInput);
                                this.refreshState();
                            }
                        };
                    };
                    componentCall.paramsGenerator_ = paramsLambda;
                }
                else {
                    this.updateStateVarsOfChildByElmtId(elmtId, {
                        label: '发送',
                        widthVal: 56
                    });
                }
            }, { name: "ProteusClassicBtn" });
        }
        Row.pop();
        // UART：独立滚动视口，与寄存器分区，运行时不再互相挤压错位
        Column.pop();
        Column.pop();
    }
    rerender() {
        this.updateDirtyElements();
    }
}
