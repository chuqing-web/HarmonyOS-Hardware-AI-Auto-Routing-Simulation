import type { IHexDebugger, CortexCoreRegs, Sfr51Regs, BootConfig, BreakpointHitCallback } from './api/IHexDebugger';
import { Mcu8051Core } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/ets/engines/Mcu8051Core";
import { CortexM3Core } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/ets/engines/CortexM3Core";
import { BreakpointEvaluator } from "@bundle:com.elecdraw.aischsim/entry@hex_debugger/ets/engines/BreakpointEvaluator";
import { McuFamily, DebugState, EventBus, ModuleEvent, HexParser, ErrCode, ResultHelper, Validate, CallbackRegistry, copyNumberMap } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { HexFirmware, McuDebugConfig, McuRegisterSnapshot, Result, HexFileInfo, FlashSegment, HexSegment, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import fs from "@ohos:file.fs";
interface InstructionHistoryEntry {
    pc: number;
    mnemonic: string;
}
function getMaxFlashSize(n382: McuFamily): number {
    if (n382 === McuFamily.MCU_8051) {
        return 0xFFFF;
    }
    if (n382 === McuFamily.MCU_STM32F1) {
        return 0x10000;
    }
    if (n382 === McuFamily.MCU_STM32F4) {
        return 0x80000;
    }
    if (n382 === McuFamily.MCU_STM32L4) {
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
    parseHexFile(g382: string): ApiResult<HexFileInfo> {
        const h382 = Validate.filePath(g382);
        if (h382 !== null)
            return ResultHelper.fail(h382);
        try {
            const j382 = fs.openSync(g382, fs.OpenMode.READ_ONLY);
            const k382 = fs.statSync(g382);
            const l382 = new ArrayBuffer(k382.size);
            fs.readSync(j382.fd, l382);
            fs.closeSync(j382);
            const m382 = this.uint8ToText(new Uint8Array(l382));
            return this.parseHexTextToInfo(m382);
        }
        catch (i382) {
            return ResultHelper.fail(ErrCode.ERR_FILE_NOT_FOUND, `Failed to read HEX: ${i382}`);
        }
    }
    parseHexData(d382: Uint8Array): ApiResult<HexFileInfo> {
        const e382 = this.uint8ToText(d382);
        const f382 = this.parseHexTextToInfo(e382);
        if (f382.success && f382.data) {
            this.lastParsedHex = f382.data;
        }
        return f382;
    }
    loadHexToMcu(t381: string, u381: HexFileInfo): ApiResult<void> {
        if (!u381.isValid)
            return ResultHelper.fail(u381.errCode);
        this.activeMcuUuid = t381;
        this.hexInfoMap.set(t381, u381);
        const v381 = new Uint8Array(u381.totalByteSize);
        for (const b382 of u381.flashSegments) {
            for (let c382 = 0; c382 < b382.data.length; c382++) {
                v381[b382.startAddr + c382] = b382.data[c382];
            }
        }
        const w381 = this.config?.mcuFamily ?? McuFamily.MCU_8051;
        const x381: HexSegment[] = u381.flashSegments.map((z381: FlashSegment): HexSegment => {
            const a382: HexSegment = {
                address: z381.startAddr,
                data: new Uint8Array(z381.data)
            };
            return a382;
        });
        const y381: HexFirmware = {
            filePath: '',
            mcuFamily: w381,
            entryPoint: u381.minAddr,
            data: v381,
            checksum: HexParser.computeChecksum(v381),
            segments: x381
        };
        this.firmware = y381;
        this.loadFirmwareToCore(y381);
        return ResultHelper.ok();
    }
    unloadMcuHex(s381: string): ApiResult<void> {
        this.hexInfoMap.delete(s381);
        if (this.activeMcuUuid === s381) {
            this.firmware = null;
            this.debugState = DebugState.RESET;
        }
        return ResultHelper.ok();
    }
    checkHexFitMcuFlash(p381: HexFileInfo, q381: McuFamily): ApiResult<void> {
        const r381 = getMaxFlashSize(q381);
        if (p381.maxAddr > r381) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, `HEX max address 0x${p381.maxAddr.toString(16)} exceeds flash 0x${r381.toString(16)}`);
        }
        if (!p381.checksumOk) {
            return ResultHelper.fail(ErrCode.ERR_HEX_PARSE_FAIL, 'Checksum mismatch');
        }
        return ResultHelper.ok();
    }
    setMcuFreq(n381: string, o381: number): ApiResult<void> {
        if (o381 <= 0)
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        this.mcuFreqMap.set(n381, o381);
        if (this.config)
            this.config.crystalFreq = o381;
        return ResultHelper.ok();
    }
    setBootConfig(l381: string, m381: BootConfig): ApiResult<void> {
        this.bootConfigMap.set(l381, m381);
        if (this.config) {
            this.config.bootPin = m381.bootPin;
            this.config.bootPin1 = m381.bootPin1;
            this.config.resetVector = m381.resetVector;
            this.config.externalMemory = m381.externalMemory;
            this.config.watchdogEnabled = m381.watchdogEnabled;
        }
        return ResultHelper.ok();
    }
    stepInto(): ApiResult<void> {
        const k381 = this.step();
        return k381.success ? ResultHelper.ok() : ResultHelper.fail(k381.errCode ?? ErrCode.ERR_MCU_NO_HEX, k381.error);
    }
    stepOut(): ApiResult<void> {
        if (this.is8051()) {
            this.stepOutTargetDepth = Math.max(0, this.callStackDepth - 1);
        }
        else {
            const j381 = this.coreCortex.getCallStack();
            this.stepOutTargetDepth = Math.max(0, j381.length - 1);
        }
        return this.runToBreakpoint();
    }
    stepOver(): ApiResult<void> {
        const h381 = this.getCurrentPc();
        this.stepOverReturnAddr = this.is8051() ? h381 + 3 : h381 + 2;
        this.breakpoints.add(this.stepOverReturnAddr);
        const i381 = this.runToBreakpoint();
        this.breakpoints.delete(this.stepOverReturnAddr);
        this.stepOverReturnAddr = -1;
        return i381;
    }
    runToBreakpoint(): ApiResult<void> {
        if (!this.firmware)
            return ResultHelper.fail(ErrCode.ERR_MCU_NO_HEX);
        this.debugState = DebugState.RUNNING;
        const d381 = this.config?.maxRunSteps ?? 100000;
        for (let e381 = 0; e381 < d381; e381++) {
            this.doSingleStep();
            const f381 = this.getCurrentPc();
            if (this.stepOutTargetDepth >= 0) {
                const g381 = this.is8051() ? this.callStackDepth : this.coreCortex.getCallStack().length;
                if (g381 <= this.stepOutTargetDepth) {
                    this.stepOutTargetDepth = -1;
                    this.debugState = DebugState.HALTED;
                    this.notifyStateChange();
                    return ResultHelper.ok();
                }
            }
            if (this.breakpoints.has(f381)) {
                this.hitBreakpoint(f381);
                this.stepOutTargetDepth = -1;
                return ResultHelper.ok();
            }
        }
        this.debugState = DebugState.HALTED;
        this.stepOutTargetDepth = -1;
        return ResultHelper.ok();
    }
    mcuSoftReset(a381?: string): ApiResult<void> {
        const b381 = a381 ?? this.activeMcuUuid;
        if (this.config)
            this.initRegisters(this.config.mcuFamily);
        this.debugState = DebugState.RESET;
        const c381 = this.hexInfoMap.get(b381);
        if (c381) {
            this.loadHexToMcu(b381, c381);
        }
        else if (this.firmware) {
            this.loadFirmwareToCore(this.firmware);
        }
        this.uartBuffer = '';
        this.notifyStateChange();
        return ResultHelper.ok();
    }
    setAddrBreakpoint(z380: number): ApiResult<void> {
        this.breakpoints.add(z380);
        return ResultHelper.ok();
    }
    setDataBreakpoint(x380: number, y380?: number): ApiResult<void> {
        this.breakpoints.add(x380);
        if (y380 !== undefined) {
            this.dataBreakpoints.set(x380, y380);
        }
        return ResultHelper.ok();
    }
    get51Sfr(): ApiResult<Sfr51Regs> {
        if (!this.is8051())
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Not 8051 MCU');
        const v380 = this.core8051.getRegisters();
        const w380: Sfr51Regs = {
            acc: v380.get('ACC') ?? 0, b: v380.get('B') ?? 0, psw: v380.get('PSW') ?? 0,
            sp: v380.get('SP') ?? 0x07, dpl: v380.get('DPL') ?? 0, dph: v380.get('DPH') ?? 0,
            p0: v380.get('P0') ?? 0xFF, p1: v380.get('P1') ?? 0xFF, p2: v380.get('P2') ?? 0xFF,
            p3: v380.get('P3') ?? 0xFF, ie: v380.get('IE') ?? 0, tcon: v380.get('TCON') ?? 0,
            th0: v380.get('TH0') ?? 0, tl0: v380.get('TL0') ?? 0, th1: v380.get('TH1') ?? 0,
            tl1: v380.get('TL1') ?? 0, scon: v380.get('SCON') ?? 0, sbuf: v380.get('SBUF') ?? 0,
            pc: this.core8051.getPc()
        };
        return ResultHelper.ok(w380);
    }
    getCortexCoreRegs(): ApiResult<CortexCoreRegs> {
        if (this.is8051())
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Not Cortex MCU');
        const u380: CortexCoreRegs = {
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
        return ResultHelper.ok(u380);
    }
    getUartLog(): string {
        return this.getUartOutput();
    }
    sendUartString(t380: string): ApiResult<void> {
        this.sendUartInput(t380);
        return ResultHelper.ok();
    }
    clearUartLog(): void {
        this.uartBuffer = '';
    }
    async exportUartLog(p380: string): Promise<ApiResult<void>> {
        const q380 = Validate.filePath(p380);
        if (q380 !== null)
            return ResultHelper.fail(q380);
        try {
            const s380 = fs.openSync(p380, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
            fs.writeSync(s380.fd, this.getUartLog());
            fs.closeSync(s380);
            return ResultHelper.ok();
        }
        catch (r380) {
            return ResultHelper.fail(ErrCode.ERR_PERMISSION, `Export UART log failed: ${r380}`);
        }
    }
    onBreakpointHit(m380: BreakpointHitCallback): void {
        this.breakpointCallbacks.push(m380);
        CallbackRegistry.getInstance().onBreakpointHit((n380, o380) => m380(n380, o380));
    }
    offBreakpointHit(k380: BreakpointHitCallback): void {
        this.breakpointCallbacks = this.breakpointCallbacks.filter((l380: BreakpointHitCallback) => l380 !== k380);
    }
    configure(j380: McuDebugConfig): Result<void> {
        this.config = j380;
        this.initRegisters(j380.mcuFamily);
        if (j380.firmware) {
            this.firmware = j380.firmware;
            this.loadFirmwareToCore(j380.firmware);
        }
        return { success: true, errCode: ErrCode.OK };
    }
    getConfig(): McuDebugConfig | null { return this.config; }
    loadHex(g380: string): Result<HexFirmware> {
        const h380 = this.parseHexFile(g380);
        if (!h380.success || !h380.data) {
            return { success: false, errCode: h380.errCode, error: h380.error };
        }
        const i380 = this.loadHexToMcu(this.activeMcuUuid, h380.data);
        if (!i380.success) {
            return { success: false, errCode: i380.errCode, error: i380.error };
        }
        return { success: true, errCode: ErrCode.OK, data: this.firmware! };
    }
    loadHexData(c380: Uint8Array, d380: McuFamily): Result<HexFirmware> {
        if (this.config)
            this.config.mcuFamily = d380;
        const e380 = this.parseHexData(c380);
        if (!e380.success || !e380.data) {
            return { success: false, errCode: e380.errCode, error: e380.error };
        }
        const f380 = this.loadHexToMcu(this.activeMcuUuid, e380.data);
        if (!f380.success) {
            return { success: false, errCode: f380.errCode, error: f380.error };
        }
        return { success: true, errCode: ErrCode.OK, data: this.firmware! };
    }
    loadHexFromString(z379: string, a380: McuFamily): Result<HexFirmware> {
        if (this.config)
            this.config.mcuFamily = a380;
        const b380 = this.parseHexTextToInfo(z379);
        if (!b380.success || !b380.data) {
            return { success: false, errCode: b380.errCode, error: b380.error };
        }
        this.loadHexToMcu(this.activeMcuUuid, b380.data);
        return { success: true, errCode: ErrCode.OK, data: this.firmware! };
    }
    run(): Result<void> {
        if (!this.firmware)
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        this.debugState = DebugState.RUNNING;
        this.notifyStateChange();
        return { success: true, errCode: ErrCode.OK };
    }
    pause(): Result<void> {
        this.debugState = DebugState.PAUSED;
        this.notifyStateChange();
        return { success: true, errCode: ErrCode.OK };
    }
    step(): Result<void> {
        if (!this.firmware)
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        this.doSingleStep();
        this.notifyStateChange();
        return { success: true, errCode: ErrCode.OK };
    }
    reset(): Result<void> {
        const y379 = this.mcuSoftReset();
        return y379.success
            ? { success: true, errCode: ErrCode.OK }
            : { success: false, errCode: y379.errCode, error: y379.error };
    }
    getDebugState(): DebugState { return this.debugState; }
    setBreakpoint(x379: number): Result<void> {
        return this.setAddrBreakpoint(x379).success
            ? { success: true, errCode: ErrCode.OK }
            : { success: false, errCode: ErrCode.ERR_PARAM_INVALID };
    }
    setConditionalBreakpoint(v379: number, w379: string): Result<void> {
        this.breakpoints.add(v379);
        this.conditionBreakpoints.set(v379, w379);
        return { success: true, errCode: ErrCode.OK };
    }
    setBreakpointIgnoreCount(t379: number, u379: number): Result<void> {
        this.bpIgnoreCounts.set(t379, u379);
        this.bpHitCounts.set(t379, 0);
        return { success: true, errCode: ErrCode.OK };
    }
    setDataWatchpoint(r379: number, s379: number): Result<void> {
        this.watchpointAddrs.set(r379, s379);
        return { success: true, errCode: ErrCode.OK };
    }
    removeBreakpoint(q379: number): Result<void> {
        this.breakpoints.delete(q379);
        this.conditionBreakpoints.delete(q379);
        this.dataBreakpoints.delete(q379);
        return { success: true, errCode: ErrCode.OK };
    }
    clearBreakpoints(): void {
        this.breakpoints.clear();
        this.conditionBreakpoints.clear();
        this.dataBreakpoints.clear();
    }
    getBreakpoints(): number[] { return Array.from(this.breakpoints); }
    readRegister(m379: string): Result<number> {
        if (this.is8051()) {
            const o379 = this.core8051.getRegisters();
            const p379 = o379.get(m379);
            if (p379 !== undefined)
                return { success: true, errCode: ErrCode.OK, data: p379 };
        }
        const n379 = this.stm32Regs.get(m379);
        if (n379 === undefined)
            return { success: false, errCode: ErrCode.ERR_PARAM_INVALID, error: `Register ${m379} not found` };
        return { success: true, errCode: ErrCode.OK, data: n379 };
    }
    writeRegister(k379: string, l379: number): Result<void> {
        this.stm32Regs.set(k379, l379);
        return { success: true, errCode: ErrCode.OK };
    }
    readMemory(e379: number, f379: number): Result<Uint8Array> {
        if (!this.firmware)
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        const g379 = new Uint8Array(f379);
        if (this.is8051()) {
            const i379 = this.core8051.getMemory();
            for (let j379 = 0; j379 < f379; j379++)
                g379[j379] = i379[e379 + j379] ?? 0;
        }
        else {
            for (let h379 = 0; h379 < f379; h379++)
                g379[h379] = this.firmware.data[e379 + h379] ?? 0;
        }
        return { success: true, errCode: ErrCode.OK, data: g379 };
    }
    writeMemory(b379: number, c379: Uint8Array): Result<void> {
        if (!this.firmware)
            return { success: false, errCode: ErrCode.ERR_MCU_NO_HEX, error: 'No firmware loaded' };
        for (let d379 = 0; d379 < c379.length; d379++) {
            this.firmware.data[b379 + d379] = c379[d379];
        }
        if (this.is8051())
            this.core8051.loadProgram(c379, b379);
        return { success: true, errCode: ErrCode.OK };
    }
    getRegisterSnapshot(): McuRegisterSnapshot | null {
        const x378 = this.is8051() ? this.core8051.getRegisters() : copyNumberMap(this.stm32Regs);
        const y378 = new Map<string, number>();
        this.pinLevels.forEach((z378: number, a379: string) => {
            y378.set(a379, z378);
        });
        return {
            timestamp: Date.now(),
            registers: x378,
            memory: this.firmware?.data ?? new Uint8Array(0),
            pinStates: y378
        };
    }
    getParsedHexInfo(): HexFileInfo | null {
        return this.lastParsedHex;
    }
    getPinLevel(w378: string): Result<number> {
        if (this.is8051())
            return { success: true, errCode: ErrCode.OK, data: this.core8051.getPinLevel(w378) };
        return { success: true, errCode: ErrCode.OK, data: this.pinLevels.get(w378) ?? 0 };
    }
    setPinLevel(u378: string, v378: number): Result<void> {
        this.pinLevels.set(u378, v378);
        if (this.is8051())
            this.core8051.setPinLevel(u378, v378);
        return { success: true, errCode: ErrCode.OK };
    }
    getUartOutput(): string {
        return this.uartBuffer + (this.is8051() ? this.core8051.getUartOutput() : '');
    }
    getInstructionHistory(): InstructionHistoryEntry[] {
        if (this.is8051())
            return [];
        return this.coreCortex.getInstructionHistory();
    }
    getPeripheralRegs(): Map<string, Map<string, number>> | null {
        if (this.is8051())
            return null;
        return this.coreCortex.getPeripheralRegs();
    }
    getCallStackDepth(): number {
        return this.callStackDepth;
    }
    sendUartInput(r378: string): void {
        for (const t378 of r378) {
            if (this.is8051())
                this.core8051.appendUart(t378);
        }
        this.uartBuffer += `[RX]${r378}`;
        const s378: UartRecvEventData = { mcuUuid: this.activeMcuUuid, data: r378 };
        EventBus.getInstance().publish({
            event: ModuleEvent.UART_RECV,
            source: 'hex_debugger',
            timestamp: Date.now(),
            data: s378
        });
    }
    private parseHexTextToInfo(j378: string): ApiResult<HexFileInfo> {
        try {
            const l378 = HexParser.parseWithValidation(j378);
            if (!l378.checksumOk) {
                return ResultHelper.fail(ErrCode.ERR_HEX_PARSE_FAIL, 'HEX checksum validation failed');
            }
            const m378: FlashSegment[] = [];
            for (let o378 = 0; o378 < l378.segments.length; o378++) {
                const p378 = l378.segments[o378];
                const q378: FlashSegment = {
                    startAddr: p378.address,
                    data: Array.from(p378.data),
                    length: p378.data.length
                };
                m378.push(q378);
            }
            const n378: HexFileInfo = {
                isValid: true,
                errCode: ErrCode.OK,
                flashSegments: m378,
                minAddr: l378.entryPoint || 0,
                maxAddr: l378.maxAddress,
                totalByteSize: l378.data.length,
                checksumOk: l378.checksumOk
            };
            return ResultHelper.ok(n378);
        }
        catch (k378) {
            return ResultHelper.fail(ErrCode.ERR_HEX_PARSE_FAIL, `HEX parse error: ${k378}`);
        }
    }
    private doSingleStep(): void {
        if (this.is8051()) {
            const f378 = this.core8051.getPc();
            const g378 = this.core8051.getMemory();
            const h378 = g378[f378];
            this.core8051.step();
            const i378 = this.core8051.getPc();
            if (this.isCallInstruction(f378)) {
                this.callStackDepth++;
            }
            else if (h378 === 0x22) {
                this.callStackDepth = Math.max(0, this.callStackDepth - 1);
            }
            this.checkBreakpoints8051(i378);
        }
        else {
            this.coreCortex.step();
            const b378 = this.coreCortex.getRegisters();
            b378.forEach((d378: number, e378: string) => this.stm32Regs.set(e378, d378));
            const c378 = this.coreCortex.getPc();
            this.stm32Regs.set('PC', c378);
            this.checkBreakpointsCortex(c378);
        }
    }
    private isCallInstruction(y377: number): boolean {
        const z377 = this.core8051.getMemory();
        const a378 = z377[y377];
        return a378 === 0x12 || a378 === 0x32;
    }
    private checkBreakpoints8051(q377: number): void {
        this.dataBreakpoints.forEach((v377: number, w377: number) => {
            const x377 = this.core8051.getMemory();
            if (x377[w377] === v377)
                this.tryHitBreakpoint(w377);
        });
        this.watchpointAddrs.forEach((r377: number, s377: number) => {
            const t377 = this.core8051.getMemory();
            const u377 = this.bpHitCounts.get(s377 + 0x100000) ?? t377[s377];
            if (t377[s377] !== u377)
                this.tryHitBreakpoint(s377);
            this.bpHitCounts.set(s377 + 0x100000, t377[s377]);
        });
        if (this.breakpoints.has(q377))
            this.tryHitBreakpoint(q377);
    }
    private checkBreakpointsCortex(i377: number): void {
        this.dataBreakpoints.forEach((n377: number, o377: number) => {
            const p377 = this.coreCortex.readMem32(o377) & 0xFF;
            if (p377 === n377) {
                this.tryHitBreakpoint(o377);
            }
        });
        this.watchpointAddrs.forEach((j377: number, k377: number) => {
            const l377 = this.coreCortex.readMem32(k377);
            const m377 = this.bpHitCounts.get(k377) ?? l377;
            if (l377 !== m377)
                this.tryHitBreakpoint(k377);
            this.bpHitCounts.set(k377, l377);
        });
        if (this.breakpoints.has(i377))
            this.tryHitBreakpoint(i377);
    }
    private tryHitBreakpoint(b377: number): void {
        const c377 = this.conditionBreakpoints.get(b377);
        if (c377) {
            const f377 = this.is8051() ? this.core8051.getRegisters() : this.stm32Regs;
            const g377 = (h377: number): number => {
                if (this.is8051())
                    return this.core8051.getMemory()[h377] ?? 0;
                return this.coreCortex.readMem32(h377);
            };
            if (!BreakpointEvaluator.evaluate(c377, f377, g377))
                return;
        }
        const d377 = this.bpIgnoreCounts.get(b377) ?? 0;
        const e377 = (this.bpHitCounts.get(b377 + 0x200000) ?? 0) + 1;
        this.bpHitCounts.set(b377 + 0x200000, e377);
        if (e377 <= d377)
            return;
        this.hitBreakpoint(b377);
    }
    private hitBreakpoint(y376: number): void {
        this.debugState = DebugState.BREAKPOINT;
        for (const a377 of this.breakpointCallbacks) {
            a377(this.activeMcuUuid, y376);
        }
        CallbackRegistry.getInstance().emitBreakpoint(this.activeMcuUuid, y376);
        const z376: BreakpointHitEventData = { mcuUuid: this.activeMcuUuid, address: y376 };
        EventBus.getInstance().publish({
            event: ModuleEvent.BREAKPOINT_HIT,
            source: 'hex_debugger',
            timestamp: Date.now(),
            data: z376
        });
    }
    private getCurrentPc(): number {
        return this.is8051() ? this.core8051.getPc() : this.coreCortex.getPc();
    }
    private loadFirmwareToCore(u376: HexFirmware): void {
        if (this.is8051()) {
            this.core8051.reset();
            this.core8051.loadProgram(u376.data, u376.entryPoint);
        }
        else {
            this.coreCortex.reset();
            this.coreCortex.loadProgram(u376.data, u376.entryPoint);
            const v376 = this.coreCortex.getRegisters();
            v376.forEach((w376: number, x376: string) => this.stm32Regs.set(x376, w376));
        }
        this.callStackDepth = 0;
    }
    private initRegisters(q376: McuFamily): void {
        this.stm32Regs.clear();
        if (q376 === McuFamily.MCU_8051) {
            this.core8051.reset();
        }
        else {
            this.coreCortex.reset();
            const r376 = this.coreCortex.getRegisters();
            r376.forEach((s376: number, t376: string) => this.stm32Regs.set(t376, s376));
        }
    }
    private is8051(): boolean {
        return this.config?.mcuFamily === McuFamily.MCU_8051;
    }
    private uint8ToText(n376: Uint8Array): string {
        let o376 = '';
        for (let p376 = 0; p376 < n376.length; p376++)
            o376 += String.fromCharCode(n376[p376]);
        return o376;
    }
    private notifyStateChange(): void {
        const m376: McuStateChangedEventData = { state: this.debugState, pc: this.getCurrentPc() };
        EventBus.getInstance().publish({
            event: ModuleEvent.MCU_STATE_CHANGED,
            source: 'hex_debugger',
            timestamp: Date.now(),
            data: m376
        });
    }
}
