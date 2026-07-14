/**
 * Signal Generator engine — generates synthetic waveforms AND injects into analog simulation
 * v2: Dual-mode — standalone synthetic + real circuit injection via AnalogEngine
 */
import { WaveData, IdUtil, SignalWaveform } from 'common';
import { SignalGenParams } from '../api/IVirtualInstruments';

const SAMPLE_POINTS = 1024;

export interface AnalogEngineSink {
  registerSignalSource(sourceId: string, nodeA: string, nodeB: string,
    waveform: string, voltage: number, amplitude: number,
    freq: number, phase: number, dutyCycle: number): void;
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

  setWaveform(waveform: SignalWaveform): void {
    this.waveform = waveform;
    this.syncToAnalog();
  }

  setParams(params: SignalGenParams): void {
    this.frequency = params.frequency;
    this.amplitude = params.amplitude;
    this.offset = params.offset;
    this.dutyCycle = params.dutyCycle;
    this.phase = params.phase;
    this.syncToAnalog();
  }

  setBurstMode(enabled: boolean, count: number = 5): void {
    this.burstEnabled = enabled;
    this.burstCount = count;
  }

  /** Connect signal generator output to specific circuit nodes */
  connectToCircuit(analogEngine: AnalogEngineSink, nodeA: string, nodeB: string): void {
    this.analogEngine = analogEngine;
    this.connectedNodeA = nodeA;
    this.connectedNodeB = nodeB;
    this.active = true;
    this.syncToAnalog();
  }

  disconnectFromCircuit(): void {
    this.active = false;
    this.analogEngine = null;
  }

  isActive(): boolean { return this.active; }

  /** Sync current parameters to the analog engine voltage source */
  private syncToAnalog(): void {
    if (!this.active || !this.analogEngine || this.connectedNodeA.length === 0) return;
    const waveformName = this.waveformName();
    this.analogEngine.registerSignalSource(
      'SIGGEN', this.connectedNodeA, this.connectedNodeB,
      waveformName, this.offset, this.amplitude, this.frequency,
      this.phase * Math.PI / 180, this.dutyCycle / 100
    );
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
    const periods = this.burstEnabled ? this.burstCount : 4;
    const windowSec = periods / Math.max(this.frequency, 1);
    const sampleRate = SAMPLE_POINTS / windowSec;
    const timeAxis: number[] = [];
    const voltageAxis: number[] = [];
    const phaseRad = this.phase * Math.PI / 180;

    for (let i = 0; i < SAMPLE_POINTS; i++) {
      const t = (i / SAMPLE_POINTS) * windowSec;
      timeAxis.push(t);
      voltageAxis.push(this.sampleAt(t, phaseRad));
    }

    return {
      waveId: IdUtil.generate('siggen'),
      probeName: 'SIG_OUT',
      netName: this.connectedNodeA.length > 0 ? this.connectedNodeA : 'SIGGEN_OUT',
      timeAxis,
      voltageAxis,
      currentAxis: new Array(SAMPLE_POINTS).fill(0),
      sampleRate,
      waveType: 'voltage',
      holdTime: windowSec
    };
  }

  /** Sample the waveform at time t for injection into the simulation */
  sampleOutput(t: number): number {
    return this.sampleAt(t, this.phase * Math.PI / 180);
  }

  private sampleAt(t: number, phaseRad: number): number {
    const omega = 2 * Math.PI * this.frequency;
    const theta = omega * t + phaseRad;
    let v = 0;

    switch (this.waveform) {
      case SignalWaveform.SINE:
        v = this.amplitude * Math.sin(theta);
        break;
      case SignalWaveform.SQUARE:
        v = Math.sin(theta) >= 0 ? this.amplitude : -this.amplitude;
        break;
      case SignalWaveform.TRIANGLE: {
        const norm = ((theta / (2 * Math.PI)) % 1 + 1) % 1;
        v = norm < 0.5
          ? this.amplitude * (4 * norm - 1)
          : this.amplitude * (3 - 4 * norm);
        break;
      }
      case SignalWaveform.SAW: {
        const norm = ((theta / (2 * Math.PI)) % 1 + 1) % 1;
        v = this.amplitude * (2 * norm - 1);
        break;
      }
      case SignalWaveform.PULSE: {
        const norm = ((theta / (2 * Math.PI)) % 1 + 1) % 1;
        v = norm < (this.dutyCycle / 100) ? this.amplitude : -this.amplitude;
        break;
      }
      default:
        v = this.amplitude * Math.sin(theta);
    }

    if (this.burstEnabled) {
      const period = 1 / Math.max(this.frequency, 1);
      if (t > this.burstCount * period) v = 0;
    }

    return v + this.offset;
  }
}
