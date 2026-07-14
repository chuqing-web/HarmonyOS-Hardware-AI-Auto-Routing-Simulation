/**
 * 虚拟仪器类型定义
 */
export enum OscTimebase {
    NS_10 = "10ns",
    US_1 = "1us",
    US_100 = "100us",
    MS_1 = "1ms",
    MS_10 = "10ms",
    S_1 = "1s",
    S_10 = "10s"
}
export enum OscVoltageScale {
    MV_1 = "1mV",
    MV_50 = "50mV",
    MV_100 = "100mV",
    MV_200 = "200mV",
    MV_500 = "500mV",
    V_1 = "1V",
    V_2 = "2V",
    V_5 = "5V",
    V_10 = "10V",
    V_100 = "100V"
}
export enum CouplingMode {
    AC = "ac",
    DC = "dc",
    GND = "gnd"
}
export enum TriggerMode {
    EDGE = "edge",
    LEVEL = "level",
    PULSE_WIDTH = "pulse_width",
    CH_A = "ch_a",
    CH_B = "ch_b"
}
export enum CaptureMode {
    ROLL = "roll",
    SINGLE = "single",
    PEAK_HOLD = "peak_hold"
}
export enum MathChannelOp {
    ADD = "ch1+ch2",
    SUB = "ch1-ch2",
    FFT = "fft"
}
export interface OscilloscopeConfig {
    timebase: OscTimebase;
    voltageScale: OscVoltageScale[];
    coupling: CouplingMode[];
    triggerMode: TriggerMode;
    triggerLevel: number;
    triggerChannel: number;
    captureMode: CaptureMode;
    mathOp: MathChannelOp;
    fftLogScale: boolean;
}
export interface CursorMeasurement {
    deltaTime: number;
    deltaVoltage: number;
    peakToPeak: number;
    rms: number;
    dutyCycle: number;
    riseTime: number;
    frequency: number;
}
export enum LogicDecodeProtocol {
    UART = "uart",
    I2C = "i2c",
    SPI = "spi",
    CAN = "can"
}
export interface LogicAnalyzerConfig {
    channelCount: number;
    threshold: number;
    decodeProtocol: LogicDecodeProtocol;
    baudRate: number;
}
export interface DecodedFrame {
    timestamp: number;
    protocol: string;
    data: string;
    raw: number[];
}
export enum MultimeterMode {
    DCV = "dcv",
    ACV = "acv",
    RESISTANCE = "res",
    CURRENT = "current",
    DIODE = "diode"
}
export enum SignalWaveform {
    SINE = "sine",
    SQUARE = "square",
    TRIANGLE = "triangle",
    SAW = "saw",
    PULSE = "pulse",
    CSV = "csv"
}
export interface SignalGenConfig {
    waveform: SignalWaveform;
    frequency: number;
    amplitude: number;
    offset: number;
    dutyCycle: number;
    phase: number;
    outputImpedance: number;
    burstEnabled: boolean;
    burstCount: number;
}
export interface UartTerminalConfig {
    hexMode: boolean;
    autoNewline: boolean;
    loopIntervalMs: number;
    timestampLog: boolean;
}
export enum VoltmeterType {
    DC = "dc",
    AC = "ac"
}
export interface VoltmeterConfig {
    type: VoltmeterType;
    range: number;
    reading: number;
    unit: string;
}
export enum AmmeterType {
    DC = "dc",
    AC = "ac"
}
export interface AmmeterConfig {
    type: AmmeterType;
    range: number;
    reading: number;
    unit: string;
}
export interface PowerMeterConfig {
    voltage: number;
    current: number;
    power: number;
    apparentPower: number;
    powerFactor: number;
    frequency: number;
}
export interface FrequencyCounterConfig {
    reading: number;
    unit: string;
    gateTime: number;
    resolution: number;
}
export interface InstrumentSnapshot {
    oscilloscope: OscilloscopeConfig;
    logicAnalyzer: LogicAnalyzerConfig;
    multimeterMode: MultimeterMode;
    signalGen: SignalGenConfig;
    uart: UartTerminalConfig;
    voltmeter: VoltmeterConfig;
    ammeter: AmmeterConfig;
    powerMeter: PowerMeterConfig;
    freqCounter: FrequencyCounterConfig;
}
