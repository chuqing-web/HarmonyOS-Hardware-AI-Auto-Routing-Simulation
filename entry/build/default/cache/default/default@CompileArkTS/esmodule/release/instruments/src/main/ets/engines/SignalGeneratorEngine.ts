import { IdUtil, SignalWaveform } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SignalGenParams } from '../api/IVirtualInstruments';
const SAMPLE_POINTS = 1024;
export interface AnalogEngineSink {
    registerSignalSource(sourceId: string, nodeA: string, nodeB: string, waveform: string, voltage: number, amplitude: number, freq: number, phase: number, dutyCycle: number): void;
    getNodeVoltageMap(): Map<string, number>;
    getBranchCurrentMap(): Map<string, number>;
    getNodeVoltage(node: string): number;
}
export class SignalGeneratorEngine {
    private waveform: SignalWaveform = SignalWaveform.SINE;
    private frequency: number = 1000;
    private amplitude: number = 3.3;
    private offset: number = 1.65;
    private dutyCycle: number = 50;
    private phase: number = 0;
    private burstEnabled: boolean = false;
    private burstCount: number = 5;
    private analogEngine: AnalogEngineSink | null = null;
    private connectedNodeA: string = '';
    private connectedNodeB: string = '0';
    private active: boolean = false;
    setWaveform(i394: SignalWaveform): void {
        this.waveform = i394;
        this.syncToAnalog();
    }
    setParams(h394: SignalGenParams): void {
        this.frequency = h394.frequency;
        this.amplitude = h394.amplitude;
        this.offset = h394.offset;
        this.dutyCycle = h394.dutyCycle;
        this.phase = h394.phase;
        this.syncToAnalog();
    }
    setBurstMode(f394: boolean, g394: number = 5): void {
        this.burstEnabled = f394;
        this.burstCount = g394;
    }
    connectToCircuit(c394: AnalogEngineSink, d394: string, e394: string): void {
        this.analogEngine = c394;
        this.connectedNodeA = d394;
        this.connectedNodeB = e394;
        this.active = true;
        this.syncToAnalog();
    }
    disconnectFromCircuit(): void {
        this.active = false;
        this.analogEngine = null;
    }
    isActive(): boolean { return this.active; }
    private syncToAnalog(): void {
        if (!this.active || !this.analogEngine || this.connectedNodeA.length === 0)
            return;
        const b394 = this.waveformName();
        this.analogEngine.registerSignalSource('SIGGEN', this.connectedNodeA, this.connectedNodeB, b394, this.offset, this.amplitude, this.frequency, this.phase * Math.PI / 180, this.dutyCycle / 100);
    }
    private waveformName(): string {
        switch (this.waveform) {
            case SignalWaveform.SINE: return 'sin';
            case SignalWaveform.SQUARE: return 'square';
            case SignalWaveform.TRIANGLE: return 'triangle';
            case SignalWaveform.SAW: return 'sawtooth';
            case SignalWaveform.PULSE: return 'pulse';
            default: return 'sin';
        }
    }
    getWaveform(): SignalWaveform { return this.waveform; }
    getFrequency(): number { return this.frequency; }
    getAmplitude(): number { return this.amplitude; }
    getOffset(): number { return this.offset; }
    getDutyCycle(): number { return this.dutyCycle; }
    getPhase(): number { return this.phase; }
    getBurstEnabled(): boolean { return this.burstEnabled; }
    getBurstCount(): number { return this.burstCount; }
    generateWave(): WaveData {
        const t393 = this.burstEnabled ? this.burstCount : 4;
        const u393 = t393 / Math.max(this.frequency, 1);
        const v393 = SAMPLE_POINTS / u393;
        const w393: number[] = [];
        const x393: number[] = [];
        const y393 = this.phase * Math.PI / 180;
        for (let z393 = 0; z393 < SAMPLE_POINTS; z393++) {
            const a394 = (z393 / SAMPLE_POINTS) * u393;
            w393.push(a394);
            x393.push(this.sampleAt(a394, y393));
        }
        return {
            waveId: IdUtil.generate('siggen'),
            probeName: 'SIG_OUT',
            netName: this.connectedNodeA.length > 0 ? this.connectedNodeA : 'SIGGEN_OUT',
            timeAxis: w393,
            voltageAxis: x393,
            currentAxis: new Array(SAMPLE_POINTS).fill(0),
            sampleRate: v393,
            waveType: 'voltage',
            holdTime: u393
        };
    }
    sampleOutput(s393: number): number {
        return this.sampleAt(s393, this.phase * Math.PI / 180);
    }
    private sampleAt(j393: number, k393: number): number {
        const l393 = 2 * Math.PI * this.frequency;
        const m393 = l393 * j393 + k393;
        let n393 = 0;
        switch (this.waveform) {
            case SignalWaveform.SINE:
                n393 = this.amplitude * Math.sin(m393);
                break;
            case SignalWaveform.SQUARE:
                n393 = Math.sin(m393) >= 0 ? this.amplitude : -this.amplitude;
                break;
            case SignalWaveform.TRIANGLE: {
                const r393 = ((m393 / (2 * Math.PI)) % 1 + 1) % 1;
                n393 = r393 < 0.5
                    ? this.amplitude * (4 * r393 - 1)
                    : this.amplitude * (3 - 4 * r393);
                break;
            }
            case SignalWaveform.SAW: {
                const q393 = ((m393 / (2 * Math.PI)) % 1 + 1) % 1;
                n393 = this.amplitude * (2 * q393 - 1);
                break;
            }
            case SignalWaveform.PULSE: {
                const p393 = ((m393 / (2 * Math.PI)) % 1 + 1) % 1;
                n393 = p393 < (this.dutyCycle / 100) ? this.amplitude : -this.amplitude;
                break;
            }
            default:
                n393 = this.amplitude * Math.sin(m393);
        }
        if (this.burstEnabled) {
            const o393 = 1 / Math.max(this.frequency, 1);
            if (j393 > this.burstCount * o393)
                n393 = 0;
        }
        return n393 + this.offset;
    }
}
