import type { IHexDebugger, CortexCoreRegs, Sfr51Regs, BootConfig, BreakpointHitCallback } from './api/IHexDebugger';
import { Mcu8051Core } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/ets/engines/Mcu8051Core";
import { CortexM3Core } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/ets/engines/CortexM3Core";
import { BreakpointEvaluator } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/ets/engines/BreakpointEvaluator";
import { McuFamily, DebugState, EventBus, ModuleEvent, HexParser, ErrCode, ResultHelper, Validate, CallbackRegistry, copyNumberMap, traceBurn, traceBurnHexInfo, formatFirmwarePreview } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { HexFirmware, McuDebugConfig, McuRegisterSnapshot, Result, HexFileInfo, FlashSegment, HexSegment, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
interface InstructionHistoryEntry {
    pc: number;
    mnemonic: string;
}
function getMaxFlashSize(family: McuFamily): number {
    if (family === McuFamily.MCU_8051) {
        return 0xFFFF;
    }
    if (family === McuFamily.MCU_STM32F1) {
        return 0x10000;
    }
    if (family === McuFamily.MCU_STM32F4) {
        return 0x80000;
    }
    if (family === McuFamily.MCU_STM32L4) {
        return 0x40000;
    }
    return 0xFFFF;
}
interface UartRecvEventData {
    mcuUuid: string;
    data: string;
}
interface BreakpointHitEventData {
    mcuUuid: string;
    address: number;
}
interface McuStateChangedEventData {
    state: DebugState;
    pc: number;
}
export class HexDebuggerImpl implements IHexDebugger {
    private config: McuDebugConfig | null = null;
    private firmware: HexFirmware | null = null;
    private hexInfoMap: Map<string, HexFileInfo> = new Map();
    private mcuFreqMap: Map<string, number> = new Map();
    private bootConfigMap: Map<string, BootConfig> = new Map();
    private debugState: DebugState = DebugState.RESET;
    private breakpoints: Set<number> = new Set();
    private dataBreakpoints: Map<number, number> = new Map();
    private conditionBreakpoints: Map<number, string> = new Map();
    private uartBuffer: string = '';
    private core8051: Mcu8051Core = new Mcu8051Core();
    private coreCortex: CortexM3Core = new CortexM3Core();
    private stm32Regs: Map<string, number> = new Map();
    private pinLevels: Map<string, number> = new Map();
    private activeMcuUuid: string = 'mcu_default';
    private breakpointCallbacks: BreakpointHitCallback[] = [];
    private callStackDepth: number = 0;
    private stepOverReturnAddr: number = -1;
    private stepOutTargetDepth: number = -1;
    private bpIgnoreCounts: Map<number, number> = new Map();
    private bpHitCounts: Map<number, number> = new Map();
    private watchpointAddrs: Map<number, number> = new Map();
    private lastParsedHex: HexFileInfo | null = null;
    // ---- v2 API ----
    parseHexFile(filePath: string): ApiResult<HexFileInfo> {
        traceBurn('PARSE_FILE', `path=${filePath}`);
        const pathErr = Validate.filePath(filePath);
        if (pathErr !== null) {
            traceBurn('PARSE_FILE_FAIL', `path=${filePath} validate=${pathErr}`);
            return ResultHelper.fail(pathErr);
        }
        try {
            const fileHandle = fs.openSync(filePath, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(filePath);
            const buffer = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buffer);
            fs.closeSync(fileHandle);
            const bytes = new Uint8Array(buffer);
            traceBurn('READ_FILE', `path=${filePath} size=${stat.size} preview=${formatFirmwarePreview(bytes)}`);
            const text = this.uint8ToText(bytes);
            const parsed = this.parseHexTextToInfo(text);
            if (parsed.success && parsed.data) {
                this.lastParsedHex = parsed.data;
                traceBurnHexInfo('PARSE_FILE_OK', parsed.data);
            }
            else {
                traceBurn('PARSE_FILE_FAIL', `path=${filePath} err=${parsed.error ?? parsed.errCode}`);
            }
            return parsed;
        }
        catch (e) {
            traceBurn('PARSE_FILE_FAIL', `path=${filePath} ex=${e}`);
            return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `Failed to read HEX: ${e}`);
        }
    }
    parseHexData(data: Uint8Array): ApiResult<HexFileInfo> {
        traceBurn('PARSE_DATA', `bytes=${data.length} preview=${formatFirmwarePreview(data)}`);
        const text = this.uint8ToText(data);
        const result = this.parseHexTextToInfo(text);
        if (result.success && result.data) {
            this.lastParsedHex = result.data;
            traceBurnHexInfo('PARSE_DATA_OK', result.data);
        }
        else {
            traceBurn('PARSE_DATA_FAIL', `err=${result.error ?? result.errCode}`);
        }
        return result;
    }
    loadHexToMcu(mcuInstUuid: string, hexInfo: HexFileInfo): ApiResult<void> {
        if (!hexInfo.isValid) {
            traceBurn('LOAD_MCU_FAIL', `uuid=${mcuInstUuid} invalid err=${hexInfo.errCode}`);
            return ResultHelper.fail(hexInfo.errCode);
        }
        this.activeMcuUuid = mcuInstUuid;
        this.hexInfoMap.set(mcuInstUuid, hexInfo);
        traceBurnHexInfo(`LOAD_MCU uuid=${mcuInstUuid}`, hexInfo);
        // Compact image: indices are relative to minAddr (never absolute 0x0800xxxx as index)
        const base = hexInfo.minAddr;
        const span = Math.max(1, hexInfo.totalByteSize);
        const data = new Uint8Array(span);
        data.fill(0xFF);
        for (const seg of hexInfo.flashSegments) {
            for (let i = 0; i < seg.data.length; i++) {
                const idx = seg.startAddr + i - base;
                if (idx >= 0 && idx < data.length) {
                    data[idx] = seg.data[i];
                }
            }
        }
        const family = this.config?.mcuFamily ?? this.firmware?.mcuFamily ?? McuFamily.MCU_8051;
        const segments: HexSegment[] = hexInfo.flashSegments.map((s: FlashSegment): HexSegment => {
            const seg: HexSegment = {
                address: s.startAddr,
                data: new Uint8Array(s.data)
            };
            return seg;
        });
        const firmware: HexFirmware = {
            filePath: '',
            mcuFamily: family,
            entryPoint: hexInfo.minAddr,
            data,
            checksum: HexParser.computeChecksum(data),
            segments: segments
        };
        this.firmware = firmware;
        this.loadFirmwareToCore(firmware);
        return ResultHelper.ok();
    }
    unloadMcuHex(mcuInstUuid: string): ApiResult<void> {
        this.hexInfoMap.delete(mcuInstUuid);
        if (this.activeMcuUuid === mcuInstUuid) {
            this.firmware = null;
            this.debugState = DebugState.RESET;
        }
        return ResultHelper.ok();
    }
    checkHexFitMcuFlash(hexInfo: HexFileInfo, mcuFamily: McuFamily): ApiResult<void> {
        const maxFlash = getMaxFlashSize(mcuFamily);
        // maxAddr may be absolute Cortex flash (0x0800xxxx); compare image span / offset into flash
        let endOffset = hexInfo.maxAddr;
        if (mcuFamily !== McuFamily.MCU_8051 && hexInfo.minAddr >= 0x08000000) {
            endOffset = hexInfo.maxAddr - 0x08000000;
        }
        else if (hexInfo.minAddr > 0 && hexInfo.totalByteSize > 0) {
            endOffset = hexInfo.totalByteSize - 1;
        }
        if (endOffset >= maxFlash || hexInfo.totalByteSize > maxFlash) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, `HEX image end 0x${hexInfo.maxAddr.toString(16)} (span ${hexInfo.totalByteSize}) exceeds flash 0x${maxFlash.toString(16)}`);
        }
        if (!hexInfo.checksumOk) {
            return ResultHelper.fail(ErrCode.ERR_HEX_PARSE_FAIL, 'Checksum mismatch');
        }
        return ResultHelper.ok();
    }
    setMcuFreq(mcuInstUuid: string, freqHz: number): ApiResult<void> {
        if (freqHz <= 0)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        this.mcuFreqMap.set(mcuInstUuid, freqHz);
        if (this.config)
            this.config.crystalFreq = freqHz;
        return ResultHelper.ok();
    }
    setBootConfig(mcuInstUuid: string, boot: BootConfig): ApiResult<void> {
        this.bootConfigMap.set(mcuInstUuid, boot);
        if (this.config) {
            this.config.bootPin = boot.bootPin;
            this.config.bootPin1 = boot.bootPin1;
            this.config.resetVector = boot.resetVector;
            this.config.externalMemory = boot.externalMemory;
            this.config.watchdogEnabled = boot.watchdogEnabled;
        }
        return ResultHelper.ok();
    }
    stepInto(): ApiResult<void> {
        const result = this.step();
        return result.success ? ResultHelper.ok() : ResultHelper.fail(result.errCode ?? ErrCode.ERR_MCU_NO_HEX, result.error);
    }
    stepOut(): ApiResult<void> {
        if (this.is8051()) {
            this.stepOutTargetDepth = Math.max(0, this.callStackDepth - 1);
        }
        else {
            const stack = this.coreCortex.getCallStack();
            this.stepOutTargetDepth = Math.max(0, stack.length - 1);
        }
        return this.runToBreakpoint();
    }
    stepOver(): ApiResult<void> {
        const pc = this.getCurrentPc();
        this.stepOverReturnAddr = this.is8051() ? pc + 3 : pc + 2;
        this.breakpoints.add(this.stepOverReturnAddr);
        const result = this.runToBreakpoint();
        this.breakpoints.delete(this.stepOverReturnAddr);
        this.stepOverReturnAddr = -1;
        return result;
    }
    runToBreakpoint(): ApiResult<void> {
        if (!this.firmware) {
            traceBurn('EXEC_RUN_BP_FAIL', 'No firmware loaded');
            return ResultHelper.fail(ErrCode.ERR_MCU_NO_HEX);
        }
        this.debugState = DebugState.RUNNING;
        const maxSteps = this.config?.maxRunSteps ?? 100000; // 2.4.19 可配置步数限制
        const pcStart = this.getCurrentPc();
        traceBurn('EXEC_RUN_BP', `pc=0x${pcStart.toString(16)} maxSteps=${maxSteps} bps=${this.breakpoints.size}`);
        for (let i = 0; i < maxSteps; i++) {
            this.doSingleStep();
            const pc = this.getCurrentPc();
            if (this.stepOutTargetDepth >= 0) {
                const depth = this.is8051() ? this.callStackDepth : this.coreCortex.getCallStack().length;
                if (depth <= this.stepOutTargetDepth) {
                    this.stepOutTargetDepth = -1;
                    this.debugState = DebugState.HALTED;
                    this.notifyStateChange();
                    traceBurn('EXEC_RUN_BP_DONE', `reason=step_out steps=${i + 1} pc=0x${pc.toString(16)}`);
                    return ResultHelper.ok();
                }
            }
            if (this.breakpoints.has(pc)) {
                this.hitBreakpoint(pc);
                this.stepOutTargetDepth = -1;
                traceBurn('EXEC_RUN_BP_DONE', `reason=breakpoint steps=${i + 1} pc=0x${pc.toString(16)}`);
                return ResultHelper.ok();
            }
        }
        this.debugState = DebugState.HALTED;
        this.stepOutTargetDepth = -1;
        traceBurn('EXEC_RUN_BP_DONE', `reason=max_steps steps=${maxSteps} pc=0x${this.getCurrentPc().toString(16)}`);
        return ResultHelper.ok();
    }
    mcuSoftReset(mcuInstUuid?: string): ApiResult<void> {
        const uuid = mcuInstUuid ?? this.activeMcuUuid;
        if (this.config)
            this.initRegisters(this.config.mcuFamily);
        this.debugState = DebugState.RESET;
        const hexInfo = this.hexInfoMap.get(uuid);
        if (hexInfo) {
            this.loadHexToMcu(uuid, hexInfo);
        }
        else if (this.firmware) {
            this.loadFirmwareToCore(this.firmware);
        }
        this.uartBuffer = '';
        this.notifyStateChange();
        return ResultHelper.ok();
    }
    setAddrBreakpoint(address: number): ApiResult<void> {
        this.breakpoints.add(address);
        return ResultHelper.ok();
    }
    setDataBreakpoint(address: number, expectedValue?: number): ApiResult<void> {
        this.breakpoints.add(address);
        if (expectedValue !== undefined) {
            this.dataBreakpoints.set(address, expectedValue);
        }
        return ResultHelper.ok();
    }
    get51Sfr(): ApiResult<Sfr51Regs> {
        if (!this.is8051())
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Not 8051 MCU');
        const regs = this.core8051.getRegisters();
        const sfr: Sfr51Regs = {
            acc: regs.get('ACC') ?? 0, b: regs.get('B') ?? 0, psw: regs.get('PSW') ?? 0,
            sp: regs.get('SP') ?? 0x07, dpl: regs.get('DPL') ?? 0, dph: regs.get('DPH') ?? 0,
            p0: regs.get('P0') ?? 0xFF, p1: regs.get('P1') ?? 0xFF, p2: regs.get('P2') ?? 0xFF,
            p3: regs.get('P3') ?? 0xFF, ie: regs.get('IE') ?? 0, tcon: regs.get('TCON') ?? 0,
            th0: regs.get('TH0') ?? 0, tl0: regs.get('TL0') ?? 0, th1: regs.get('TH1') ?? 0,
            tl1: regs.get('TL1') ?? 0, scon: regs.get('SCON') ?? 0, sbuf: regs.get('SBUF') ?? 0,
            pc: this.core8051.getPc()
        };
        return ResultHelper.ok(sfr);
    }
    getCortexCoreRegs(): ApiResult<CortexCoreRegs> {
        if (this.is8051())
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Not Cortex MCU');
        const coreRegs: CortexCoreRegs = {
            r0: this.stm32Regs.get('R0') ?? 0, r1: this.stm32Regs.get('R1') ?? 0,
            r2: this.stm32Regs.get('R2') ?? 0, r3: this.stm32Regs.get('R3') ?? 0,
            r4: this.stm32Regs.get('R4') ?? 0, r5: this.stm32Regs.get('R5') ?? 0,
            r6: this.stm32Regs.get('R6') ?? 0, r7: this.stm32Regs.get('R7') ?? 0,
            r8: this.stm32Regs.get('R8') ?? 0, r9: this.stm32Regs.get('R9') ?? 0,
            r10: this.stm32Regs.get('R10') ?? 0, r11: this.stm32Regs.get('R11') ?? 0,
            r12: this.stm32Regs.get('R12') ?? 0,
            sp: this.stm32Regs.get('SP') ?? 0, lr: this.stm32Regs.get('LR') ?? 0,
            pc: this.stm32Regs.get('PC') ?? 0, xpsr: this.stm32Regs.get('xPSR') ?? 0
        };
        return ResultHelper.ok(coreRegs);
    }
    getUartLog(): string {
        return this.getUartOutput();
    }
    sendUartString(data: string): ApiResult<void> {
        this.sendUartInput(data);
        return ResultHelper.ok();
    }
    clearUartLog(): void {
        this.uartBuffer = '';
    }
    async exportUartLog(path: string): Promise<ApiResult<void>> {
        const pathErr = Validate.filePath(path);
        if (pathErr !== null)
            return ResultHelper.fail(pathErr);
        try {
            const fileHandle = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(fileHandle.fd, this.getUartLog());
            fs.closeSync(fileHandle);
            return ResultHelper.ok();
        }
        catch (e) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Export UART log failed: ${e}`);
        }
    }
    onBreakpointHit(callback: BreakpointHitCallback): void {
        this.breakpointCallbacks.push(callback);
        CallbackRegistry.getInstance().onBreakpointHit((uuid, addr) => callback(uuid, addr));
    }
    offBreakpointHit(callback: BreakpointHitCallback): void {
        this.breakpointCallbacks = this.breakpointCallbacks.filter((c: BreakpointHitCallback) => c !== callback);
    }
    // ---- v1 兼容 ----
    configure(config: McuDebugConfig): Result<void> {
        this.config = config;
        this.initRegisters(config.mcuFamily);
        if (config.firmware) {
            this.firmware = config.firmware;
            this.loadFirmwareToCore(config.firmware);
        }
        return { success: true, errCode: ErrCode.OK };
    }
    getConfig(): McuDebugConfig | null { return this.config; }
    loadHex(filePath: string): Result<HexFirmware> {
        traceBurn('LOAD_HEX', `path=${filePath} mcu=${this.activeMcuUuid}`);
        const infoResult = this.parseHexFile(filePath);
        if (!infoResult.success || !infoResult.data) {
            traceBurn('LOAD_HEX_FAIL', `path=${filePath} err=${infoResult.error ?? infoResult.errCode}`);
            return { success: false, errCode: infoResult.errCode, error: infoResult.error };
        }
        const loadResult = this.loadHexToMcu(this.activeMcuUuid, infoResult.data);
        if (!loadResult.success) {
            traceBurn('LOAD_HEX_FAIL', `path=${filePath} err=${loadResult.error ?? loadResult.errCode}`);
            return { success: false, errCode: loadResult.errCode, error: loadResult.error };
        }
        const fw = this.firmware!;
        traceBurn('LOAD_HEX_OK', `path=${filePath} family=${fw.mcuFamily} entry=0x${fw.entryPoint.toString(16)} ` +
            `bytes=${fw.data.length} checksum=${fw.checksum} segs=${fw.segments.length}`);
        return { success: true, errCode: ErrCode.OK, data: fw };
    }
    loadHexData(data: Uint8Array, mcuFamily: McuFamily): Result<HexFirmware> {
        const familyName = `${mcuFamily}`;
        traceBurn('LOAD_HEX_DATA', `family=${familyName} bytes=${data.length} mcu=${this.activeMcuUuid} preview=${formatFirmwarePreview(data)}`);
        // Ensure family is on firmware path even when McuDebugConfig was never set
        if (this.config) {
            this.config.mcuFamily = mcuFamily;
        }
        const infoResult = this.parseHexData(data);
        if (!infoResult.success || !infoResult.data) {
            traceBurn('LOAD_HEX_DATA_FAIL', `err=${infoResult.error ?? infoResult.errCode}`);
            return { success: false, errCode: infoResult.errCode, error: infoResult.error };
        }
        // Seed firmware.mcuFamily before loadFirmwareToCore via temporary stub
        this.firmware = {
            filePath: '',
            mcuFamily: mcuFamily,
            entryPoint: 0,
            data: new Uint8Array(0),
            checksum: '0',
            segments: []
        };
        const loadResult = this.loadHexToMcu(this.activeMcuUuid, infoResult.data);
        if (!loadResult.success) {
            traceBurn('LOAD_HEX_DATA_FAIL', `err=${loadResult.error ?? loadResult.errCode}`);
            return { success: false, errCode: loadResult.errCode, error: loadResult.error };
        }
        const fw = this.firmware!;
        traceBurn('LOAD_HEX_DATA_OK', `family=${familyName} entry=0x${fw.entryPoint.toString(16)} bytes=${fw.data.length} ` +
            `checksum=${fw.checksum} segs=${fw.segments.length} ` +
            `imagePreview=${formatFirmwarePreview(fw.data)}`);
        return { success: true, errCode: ErrCode.OK, data: fw };
    }
    loadHexFromString(hexText: string, mcuFamily: McuFamily): Result<HexFirmware> {
        const familyName = `${mcuFamily}`;
        traceBurn('LOAD_HEX_STRING', `family=${familyName} chars=${hexText.length}`);
        if (this.config)
            this.config.mcuFamily = mcuFamily;
        const infoResult = this.parseHexTextToInfo(hexText);
        if (!infoResult.success || !infoResult.data) {
            traceBurn('LOAD_HEX_STRING_FAIL', `err=${infoResult.error ?? infoResult.errCode}`);
            return { success: false, errCode: infoResult.errCode, error: infoResult.error };
        }
        this.lastParsedHex = infoResult.data;
        traceBurnHexInfo('PARSE_STRING_OK', infoResult.data);
        this.loadHexToMcu(this.activeMcuUuid, infoResult.data);
        return { success: true, errCode: ErrCode.OK, data: this.firmware! };
    }
    run(): Result<void> {
        if (!this.firmware) {
            traceBurn('EXEC_RUN_FAIL', 'No firmware loaded');
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        }
        this.debugState = DebugState.RUNNING;
        traceBurn('EXEC_RUN', `pc=0x${this.getCurrentPc().toString(16)} family=${this.config?.mcuFamily ?? '?'} ` +
            `bytes=${this.firmware.data.length}`);
        this.notifyStateChange();
        return { success: true, errCode: ErrCode.OK };
    }
    pause(): Result<void> {
        this.debugState = DebugState.PAUSED;
        traceBurn('EXEC_PAUSE', `pc=0x${this.getCurrentPc().toString(16)}`);
        this.notifyStateChange();
        return { success: true, errCode: ErrCode.OK };
    }
    step(): Result<void> {
        if (!this.firmware) {
            traceBurn('EXEC_STEP_FAIL', 'No firmware loaded');
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        }
        const pcBefore = this.getCurrentPc();
        this.doSingleStep();
        const pcAfter = this.getCurrentPc();
        traceBurn('EXEC_STEP', `pc=0x${pcBefore.toString(16)}->0x${pcAfter.toString(16)}`);
        this.notifyStateChange();
        return { success: true, errCode: ErrCode.OK };
    }
    reset(): Result<void> {
        const result = this.mcuSoftReset();
        traceBurn(result.success ? 'EXEC_RESET' : 'EXEC_RESET_FAIL', `pc=0x${this.getCurrentPc().toString(16)} err=${result.error ?? '-'}`);
        return result.success
            ? { success: true, errCode: ErrCode.OK }
            : { success: false, errCode: result.errCode, error: result.error };
    }
    getDebugState(): DebugState { return this.debugState; }
    setBreakpoint(address: number): Result<void> {
        return this.setAddrBreakpoint(address).success
            ? { success: true, errCode: ErrCode.OK }
            : { success: false, errCode: ErrCode.ERR_PARAM_INVALID };
    }
    setConditionalBreakpoint(address: number, condition: string): Result<void> {
        this.breakpoints.add(address);
        this.conditionBreakpoints.set(address, condition);
        return { success: true, errCode: ErrCode.OK };
    }
    setBreakpointIgnoreCount(address: number, ignoreCount: number): Result<void> {
        this.bpIgnoreCounts.set(address, ignoreCount);
        this.bpHitCounts.set(address, 0);
        return { success: true, errCode: ErrCode.OK };
    }
    setDataWatchpoint(address: number, expectedValue: number): Result<void> {
        this.watchpointAddrs.set(address, expectedValue);
        return { success: true, errCode: ErrCode.OK };
    }
    removeBreakpoint(address: number): Result<void> {
        this.breakpoints.delete(address);
        this.conditionBreakpoints.delete(address);
        this.dataBreakpoints.delete(address);
        return { success: true, errCode: ErrCode.OK };
    }
    clearBreakpoints(): void {
        this.breakpoints.clear();
        this.conditionBreakpoints.clear();
        this.dataBreakpoints.clear();
    }
    getBreakpoints(): number[] { return Array.from(this.breakpoints); }
    readRegister(name: string): Result<number> {
        if (this.is8051()) {
            const regs = this.core8051.getRegisters();
            const val = regs.get(name);
            if (val !== undefined)
                return { success: true, errCode: ErrCode.OK, data: val };
        }
        const val = this.stm32Regs.get(name);
        if (val === undefined)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Register ${name} not found` };
        return { success: true, errCode: ErrCode.OK, data: val };
    }
    writeRegister(name: string, value: number): Result<void> {
        this.stm32Regs.set(name, value);
        return { success: true, errCode: ErrCode.OK };
    }
    readMemory(address: number, length: number): Result<Uint8Array> {
        if (!this.firmware)
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        const data = new Uint8Array(length);
        if (this.is8051()) {
            const mem = this.core8051.getMemory();
            for (let i = 0; i < length; i++)
                data[i] = mem[address + i] ?? 0;
        }
        else {
            for (let i = 0; i < length; i++)
                data[i] = this.firmware.data[address + i] ?? 0;
        }
        return { success: true, errCode: ErrCode.OK, data: data };
    }
    writeMemory(address: number, data: Uint8Array): Result<void> {
        if (!this.firmware)
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        for (let i = 0; i < data.length; i++) {
            this.firmware.data[address + i] = data[i];
        }
        if (this.is8051())
            this.core8051.loadProgram(data, address);
        return { success: true, errCode: ErrCode.OK };
    }
    getRegisterSnapshot(): McuRegisterSnapshot | null {
        const regs = this.is8051() ? this.core8051.getRegisters() : copyNumberMap(this.stm32Regs);
        const pinStates = new Map<string, number>();
        this.pinLevels.forEach((v: number, k: string) => {
            pinStates.set(k, v);
        });
        return {
            timestamp: Date.now(),
            registers: regs,
            memory: this.firmware?.data ?? new Uint8Array(0),
            pinStates: pinStates
        };
    }
    getParsedHexInfo(): HexFileInfo | null {
        return this.lastParsedHex;
    }
    getPinLevel(pinName: string): Result<number> {
        if (this.is8051())
            return { success: true, errCode: ErrCode.OK, data: this.core8051.getPinLevel(pinName) };
        return { success: true, errCode: ErrCode.OK, data: this.pinLevels.get(pinName) ?? 0 };
    }
    setPinLevel(pinName: string, level: number): Result<void> {
        this.pinLevels.set(pinName, level);
        if (this.is8051())
            this.core8051.setPinLevel(pinName, level);
        return { success: true, errCode: ErrCode.OK };
    }
    getUartOutput(): string {
        return this.uartBuffer + (this.is8051() ? this.core8051.getUartOutput() : '');
    }
    appendUartOutput(data: string): void {
        if (data.length === 0) {
            return;
        }
        this.uartBuffer += data;
    }
    /** 2.4.17 获取指令历史追踪 (最近1000条) */
    getInstructionHistory(): InstructionHistoryEntry[] {
        if (this.is8051())
            return []; // 8051 暂无指令历史
        return this.coreCortex.getInstructionHistory();
    }
    /** 2.4.20 获取外设寄存器分组视图 */
    getPeripheralRegs(): Map<string, Map<string, number>> | null {
        if (this.is8051())
            return null;
        return this.coreCortex.getPeripheralRegs();
    }
    /** 2.4.16 获取8051调用栈深度 */
    getCallStackDepth(): number {
        return this.callStackDepth;
    }
    sendUartInput(data: string): void {
        for (const ch of data) {
            if (this.is8051())
                this.core8051.appendUart(ch);
        }
        this.uartBuffer += `[RX]${data}`;
        const uartData: UartRecvEventData = { mcuUuid: this.activeMcuUuid, data: data };
        EventBus.getInstance().publish({
            event: ModuleEvent.UART_RECV,
            source: 'hex_debugger',
            timestamp: Date.now(),
            data: uartData
        });
    }
    // ---- internal ----
    private parseHexTextToInfo(text: string): ApiResult<HexFileInfo> {
        try {
            const parsed = HexParser.parseWithValidation(text);
            if (!parsed.checksumOk) {
                return ResultHelper.fail(ErrCode.ERR_HEX_PARSE_FAIL, 'HEX checksum validation failed');
            }
            const segments: FlashSegment[] = [];
            for (let i = 0; i < parsed.segments.length; i++) {
                const s = parsed.segments[i];
                const seg: FlashSegment = {
                    startAddr: s.address,
                    data: Array.from(s.data),
                    length: s.data.length
                };
                segments.push(seg);
            }
            const info: HexFileInfo = {
                isValid: true,
                errCode: ErrCode.OK,
                flashSegments: segments,
                minAddr: parsed.minAddress,
                maxAddr: parsed.maxAddress,
                totalByteSize: parsed.data.length,
                checksumOk: parsed.checksumOk
            };
            return ResultHelper.ok(info);
        }
        catch (e) {
            return ResultHelper.fail(ErrCode.ERR_HEX_PARSE_FAIL, `HEX parse error: ${e}`);
        }
    }
    private doSingleStep(): void {
        if (this.is8051()) {
            const prevPc = this.core8051.getPc();
            const mem = this.core8051.getMemory();
            const op = mem[prevPc];
            this.core8051.step();
            const pc = this.core8051.getPc();
            if (this.isCallInstruction(prevPc)) {
                this.callStackDepth++;
            }
            else if (op === 0x22) {
                this.callStackDepth = Math.max(0, this.callStackDepth - 1);
            }
            this.checkBreakpoints8051(pc);
        }
        else {
            this.coreCortex.step();
            const regs = this.coreCortex.getRegisters();
            regs.forEach((v: number, k: string) => this.stm32Regs.set(k, v));
            const pc = this.coreCortex.getPc();
            this.stm32Regs.set('PC', pc);
            this.checkBreakpointsCortex(pc);
        }
    }
    private isCallInstruction(pc: number): boolean {
        const mem = this.core8051.getMemory();
        const op = mem[pc];
        return op === 0x12 || op === 0x32;
    }
    private checkBreakpoints8051(pc: number): void {
        this.dataBreakpoints.forEach((expected: number, addr: number) => {
            const mem = this.core8051.getMemory();
            if (mem[addr] === expected)
                this.tryHitBreakpoint(addr);
        });
        this.watchpointAddrs.forEach((_expected: number, addr: number) => {
            const mem = this.core8051.getMemory();
            const prev = this.bpHitCounts.get(addr + 0x100000) ?? mem[addr];
            if (mem[addr] !== prev)
                this.tryHitBreakpoint(addr);
            this.bpHitCounts.set(addr + 0x100000, mem[addr]);
        });
        if (this.breakpoints.has(pc))
            this.tryHitBreakpoint(pc);
    }
    private checkBreakpointsCortex(pc: number): void {
        this.dataBreakpoints.forEach((expected: number, addr: number) => {
            const val = this.coreCortex.readMem32(addr) & 0xFF;
            if (val === expected) {
                this.tryHitBreakpoint(addr);
            }
        });
        this.watchpointAddrs.forEach((_expected: number, addr: number) => {
            const val = this.coreCortex.readMem32(addr);
            const prev = this.bpHitCounts.get(addr) ?? val;
            if (val !== prev)
                this.tryHitBreakpoint(addr);
            this.bpHitCounts.set(addr, val);
        });
        if (this.breakpoints.has(pc))
            this.tryHitBreakpoint(pc);
    }
    private tryHitBreakpoint(addr: number): void {
        const cond = this.conditionBreakpoints.get(addr);
        if (cond) {
            const regs = this.is8051() ? this.core8051.getRegisters() : this.stm32Regs;
            const readMem = (a: number): number => {
                if (this.is8051())
                    return this.core8051.getMemory()[a] ?? 0;
                return this.coreCortex.readMem32(a);
            };
            if (!BreakpointEvaluator.evaluate(cond, regs, readMem))
                return;
        }
        const ignore = this.bpIgnoreCounts.get(addr) ?? 0;
        const hits = (this.bpHitCounts.get(addr + 0x200000) ?? 0) + 1;
        this.bpHitCounts.set(addr + 0x200000, hits);
        if (hits <= ignore)
            return;
        this.hitBreakpoint(addr);
    }
    private hitBreakpoint(addr: number): void {
        this.debugState = DebugState.BREAKPOINT;
        for (const cb of this.breakpointCallbacks) {
            cb(this.activeMcuUuid, addr);
        }
        CallbackRegistry.getInstance().emitBreakpoint(this.activeMcuUuid, addr);
        const hitData: BreakpointHitEventData = { mcuUuid: this.activeMcuUuid, address: addr };
        EventBus.getInstance().publish({
            event: ModuleEvent.BREAKPOINT_HIT,
            source: 'hex_debugger',
            timestamp: Date.now(),
            data: hitData
        });
    }
    private getCurrentPc(): number {
        return this.is8051() ? this.core8051.getPc() : this.coreCortex.getPc();
    }
    private loadFirmwareToCore(firmware: HexFirmware): void {
        const coreName = this.is8051() ? '8051' : 'CortexM3';
        traceBurn('LOAD_CORE', `core=${coreName} entry=0x${firmware.entryPoint.toString(16)} bytes=${firmware.data.length} ` +
            `checksum=${firmware.checksum} preview=${formatFirmwarePreview(firmware.data)}`);
        if (this.is8051()) {
            this.core8051.reset();
            // Compact image base = entryPoint/minAddr (usually 0 for 8051)
            const offset8051 = firmware.entryPoint >= 0 && firmware.entryPoint < 0x10000
                ? firmware.entryPoint : 0;
            this.core8051.loadProgram(firmware.data, offset8051);
        }
        else {
            this.coreCortex.reset();
            // Cortex flash window starts at 0x08000000; compact image is relative to min flash addr
            const FLASH_BASE = 0x08000000;
            let loadOffset = 0;
            if (firmware.entryPoint >= FLASH_BASE) {
                loadOffset = firmware.entryPoint - FLASH_BASE;
            }
            else if (firmware.segments.length > 0) {
                const lowest = firmware.segments.reduce((m: number, s: HexSegment) => Math.min(m, s.address), firmware.segments[0].address);
                if (lowest >= FLASH_BASE) {
                    loadOffset = lowest - FLASH_BASE;
                }
            }
            this.coreCortex.loadProgram(firmware.data, loadOffset);
            const regs = this.coreCortex.getRegisters();
            regs.forEach((v: number, k: string) => this.stm32Regs.set(k, v));
        }
        this.callStackDepth = 0;
        traceBurn('LOAD_CORE_OK', `core=${coreName} pc=0x${this.getCurrentPc().toString(16)}`);
    }
    private initRegisters(family: McuFamily): void {
        this.stm32Regs.clear();
        if (family === McuFamily.MCU_8051) {
            this.core8051.reset();
        }
        else {
            this.coreCortex.reset();
            const regs = this.coreCortex.getRegisters();
            regs.forEach((v: number, k: string) => this.stm32Regs.set(k, v));
        }
    }
    private is8051(): boolean {
        // config may be null when template auto-loads HEX before configure() —
        // fall back to firmware.mcuFamily so we do not load into CortexM3 by mistake.
        const fam = this.config?.mcuFamily ?? this.firmware?.mcuFamily ?? McuFamily.MCU_8051;
        return fam === McuFamily.MCU_8051;
    }
    private uint8ToText(data: Uint8Array): string {
        let text = '';
        for (let i = 0; i < data.length; i++)
            text += String.fromCharCode(data[i]);
        return text;
    }
    private notifyStateChange(): void {
        const stateData: McuStateChangedEventData = { state: this.debugState, pc: this.getCurrentPc() };
        EventBus.getInstance().publish({
            event: ModuleEvent.MCU_STATE_CHANGED,
            source: 'hex_debugger',
            timestamp: Date.now(),
            data: stateData
        });
    }
}
