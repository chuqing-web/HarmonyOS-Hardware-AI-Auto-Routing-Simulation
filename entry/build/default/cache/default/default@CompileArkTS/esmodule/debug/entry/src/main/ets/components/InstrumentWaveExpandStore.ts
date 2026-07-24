/**
 * 仪器波形放大弹窗会话：一次仿真内保留各仪器波形/读数，下次仿真清空。
 */
export const INSTR_WAVE_EXPAND_OPEN_KEY: string = 'instr_wave_expand_open';
export const INSTR_WAVE_EXPAND_TICK_KEY: string = 'instr_wave_expand_tick';
export class InstrumentWaveExpandStore {
    private static instance: InstrumentWaveExpandStore | null = null;
    visible: boolean = false;
    kind: string = 'osc';
    title: string = '';
    detail: string = '';
    frameId: number = 0;
    timeData: number[] = [];
    voltageData: number[] = [];
    timeData2: number[] = [];
    voltageData2: number[] = [];
    channelLabel: string = 'CH1';
    waveColor: string = '#00e676';
    vPerDiv: number = 1;
    tPerDiv: number = 1e-3;
    triggerLevel: number = 0;
    autoFit: boolean = true;
    /** 示波器 FFT：横轴为 Hz */
    freqDomain: boolean = false;
    showCh2: boolean = false;
    ch2Label: string = 'CH2';
    ch2Color: string = '#40c4ff';
    channelData: number[][] = [];
    channelCount: number = 8;
    sampleCount: number = 128;
    private constructor() {
    }
    static getInstance(): InstrumentWaveExpandStore {
        if (InstrumentWaveExpandStore.instance === null) {
            InstrumentWaveExpandStore.instance = new InstrumentWaveExpandStore();
        }
        return InstrumentWaveExpandStore.instance;
    }
    static ensureAppStorage(): void {
        AppStorage.setOrCreate(INSTR_WAVE_EXPAND_OPEN_KEY, false);
        AppStorage.setOrCreate(INSTR_WAVE_EXPAND_TICK_KEY, 0);
    }
    private bumpUi(): void {
        InstrumentWaveExpandStore.ensureAppStorage();
        const prev = AppStorage.get<number>(INSTR_WAVE_EXPAND_TICK_KEY);
        const next = (prev !== undefined ? prev : 0) + 1;
        AppStorage.setOrCreate(INSTR_WAVE_EXPAND_TICK_KEY, next);
        AppStorage.setOrCreate(INSTR_WAVE_EXPAND_OPEN_KEY, this.visible);
    }
    open(kind: string, title: string, detail: string): void {
        this.kind = kind;
        this.title = title;
        this.detail = detail;
        this.visible = true;
        this.bumpUi();
    }
    close(): void {
        this.visible = false;
        this.bumpUi();
    }
    /** 下次仿真开始：清空会话缓存并关闭弹窗 */
    clearSession(): void {
        this.timeData = [];
        this.voltageData = [];
        this.timeData2 = [];
        this.voltageData2 = [];
        this.channelData = [];
        this.sampleCount = 128;
        this.detail = '';
        this.frameId = 0;
        this.showCh2 = false;
        if (this.visible) {
            this.visible = false;
        }
        this.bumpUi();
    }
    setOscSnapshot(time1: number[], volt1: number[], time2: number[], volt2: number[], label1: string, color1: string, label2: string, color2: string, vPerDiv: number, tPerDiv: number, trigger: number, autoFit: boolean, frameId: number, detail: string, freqDomain: boolean = false): void {
        this.timeData = time1.slice();
        this.voltageData = volt1.slice();
        this.timeData2 = time2.slice();
        this.voltageData2 = volt2.slice();
        this.showCh2 = volt2.length > 1;
        this.channelLabel = label1;
        this.waveColor = color1;
        this.ch2Label = label2;
        this.ch2Color = color2;
        this.vPerDiv = vPerDiv;
        this.tPerDiv = tPerDiv;
        this.triggerLevel = trigger;
        this.autoFit = autoFit;
        this.freqDomain = freqDomain;
        this.frameId = frameId;
        this.detail = detail;
    }
    setMeterSnapshot(time: number[], volt: number[], label: string, color: string, frameId: number, detail: string, tPerDiv: number = 1e-3): void {
        this.timeData = time.slice();
        this.voltageData = volt.slice();
        this.timeData2 = [];
        this.voltageData2 = [];
        this.showCh2 = false;
        this.channelLabel = label;
        this.waveColor = color;
        this.vPerDiv = 1;
        this.tPerDiv = tPerDiv > 0 ? tPerDiv : 1e-3;
        this.triggerLevel = 0;
        this.autoFit = true;
        this.frameId = frameId;
        this.detail = detail;
    }
    setLogicSnapshot(channels: number[][], channelCount: number, sampleCount: number, detail: string): void {
        const copy: number[][] = [];
        for (let i = 0; i < channels.length; i++) {
            copy.push(channels[i].slice());
        }
        this.channelData = copy;
        this.channelCount = channelCount;
        this.sampleCount = sampleCount;
        this.detail = detail;
        this.frameId = this.frameId + 1;
    }
    /** 弹窗打开时同步当前种类的实时数据并刷新 UI */
    refreshIfOpen(kind: string): void {
        if (this.visible && this.kind === kind) {
            this.bumpUi();
        }
    }
}
