import { IdUtil, LogicDecodeProtocol } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData, DecodedFrame } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SignalGroup } from '../api/IVirtualInstruments';
const MAX_SAMPLES = 8192;
export class LogicAnalyzerEngine {
    private channelCount: number = 8;
    private threshold: number = 1.65;
    private decodeProtocol: LogicDecodeProtocol = LogicDecodeProtocol.UART;
    private baudRate: number = 115200;
    private signalGroups: SignalGroup[] = [];
    private decodedFrames: DecodedFrame[] = [];
    private simulationWaves: WaveData[] = [];
    private digitalStates: Map<string, number> = new Map();
    private sampleRate: number = 1e6;
    feedSimulationWaves(l386: WaveData[]): void {
        this.simulationWaves = l386.slice();
    }
    feedDigitalStates(k386: Map<string, number>): void {
        this.digitalStates = new Map(k386);
    }
    setChannels(j386: number): void { this.channelCount = j386; }
    setSampleRate(i386: number): void { this.sampleRate = Math.max(1000, i386); }
    setThreshold(h386: number): void { this.threshold = h386 / 1000; }
    decodeBus(f386: LogicDecodeProtocol, g386: number = 115200): void {
        this.decodeProtocol = f386;
        this.baudRate = g386;
        this.decodedFrames = [];
        this.runDecoder();
    }
    groupSignals(c386: SignalGroup[]): void {
        this.signalGroups = c386.map((d386: SignalGroup): SignalGroup => {
            const e386: SignalGroup = {
                name: d386.name,
                channelIndices: d386.channelIndices.slice()
            };
            return e386;
        });
    }
    getChannelCount(): number { return this.channelCount; }
    getThreshold(): number { return this.threshold * 1000; }
    getDecodeProtocol(): LogicDecodeProtocol { return this.decodeProtocol; }
    getBaudRate(): number { return this.baudRate; }
    getSignalGroups(): SignalGroup[] {
        return this.signalGroups.map((a386: SignalGroup): SignalGroup => {
            const b386: SignalGroup = { name: a386.name, channelIndices: a386.channelIndices.slice() };
            return b386;
        });
    }
    getDecodedFrames(): DecodedFrame[] { return this.decodedFrames.slice(); }
    captureChannelsForProbes(p385: string[]): WaveData[] {
        const q385: WaveData[] = [];
        const r385 = Math.min(this.channelCount, p385.length);
        for (let s385 = 0; s385 < r385; s385++) {
            const t385 = p385[s385];
            if (t385.length === 0) {
                continue;
            }
            let u385: WaveData | undefined = undefined;
            for (let y385 = 0; y385 < this.simulationWaves.length; y385++) {
                const z385 = this.simulationWaves[y385];
                if (this.waveMatchesProbe(z385, t385)) {
                    u385 = z385;
                    break;
                }
            }
            if (u385 !== undefined && u385.voltageAxis.length > 0) {
                const w385 = u385.voltageAxis.map(x385 => x385 > this.threshold ? 3.3 : 0);
                q385.push({
                    waveId: IdUtil.generate('la'),
                    probeName: `D${s385}`,
                    netName: t385,
                    timeAxis: u385.timeAxis.slice(),
                    voltageAxis: w385,
                    currentAxis: new Array(w385.length).fill(0),
                    sampleRate: u385.sampleRate,
                    waveType: 'digital',
                    holdTime: u385.holdTime
                });
            }
            else if (this.digitalStates.size > 0) {
                const v385 = (this.digitalStates.get(t385) ?? this.digitalStates.get(`D${s385}`) ?? 0) > 0.5 ? 3.3 : 0;
                q385.push({
                    waveId: IdUtil.generate('la'),
                    probeName: `D${s385}`,
                    netName: t385,
                    timeAxis: [0, 1e-3],
                    voltageAxis: [v385, v385],
                    currentAxis: [0, 0],
                    sampleRate: 1000,
                    waveType: 'digital',
                    holdTime: 1e-3
                });
            }
        }
        if (q385.length > 0) {
            return q385;
        }
        return this.captureAllChannels();
    }
    private waveMatchesProbe(n385: WaveData, o385: string): boolean {
        if (o385.length === 0) {
            return false;
        }
        return n385.netName === o385 || n385.probeName === o385;
    }
    captureAllChannels(): WaveData[] {
        const x384: WaveData[] = [];
        if (this.simulationWaves.length > 0) {
            for (let j385 = 0; j385 < Math.min(this.channelCount, this.simulationWaves.length); j385++) {
                const k385 = this.simulationWaves[j385];
                if (k385 && k385.voltageAxis.length > 0) {
                    const l385 = k385.voltageAxis.map(m385 => m385 > this.threshold ? 3.3 : 0);
                    x384.push({
                        waveId: IdUtil.generate('la'),
                        probeName: `D${j385}`,
                        netName: k385.netName,
                        timeAxis: k385.timeAxis.slice(),
                        voltageAxis: l385,
                        currentAxis: new Array(l385.length).fill(0),
                        sampleRate: k385.sampleRate,
                        waveType: 'digital',
                        holdTime: k385.holdTime
                    });
                }
            }
            return x384;
        }
        if (this.digitalStates.size > 0) {
            const a385: string[] = [];
            this.digitalStates.forEach((g385: number, h385: string) => {
                const i385 = h385.toUpperCase();
                if (i385 !== '0' && i385 !== 'GND' && i385 !== 'VCC' && i385 !== 'VDD') {
                    a385.push(h385);
                }
            });
            for (let b385 = 0; b385 < this.channelCount; b385++) {
                const c385 = b385 < a385.length ? a385[b385] : `D${b385}`;
                const d385 = (this.digitalStates.get(c385) ?? 0) > 0.5 ? 3.3 : 0;
                const e385 = [0, 1e-3];
                const f385 = [d385, d385];
                x384.push({
                    waveId: IdUtil.generate('la'),
                    probeName: `D${b385}`,
                    netName: c385,
                    timeAxis: e385,
                    voltageAxis: f385,
                    currentAxis: [0, 0],
                    sampleRate: 1000,
                    waveType: 'digital',
                    holdTime: 1e-3
                });
            }
            return x384;
        }
        for (let y384 = 0; y384 < this.channelCount; y384++) {
            const z384 = [0, 1e-3];
            x384.push({
                waveId: IdUtil.generate('la'),
                probeName: `D${y384}`,
                netName: `LOGIC_D${y384}`,
                timeAxis: z384,
                voltageAxis: [0, 0],
                currentAxis: [0, 0],
                sampleRate: 1000,
                waveType: 'digital',
                holdTime: 1e-3
            });
        }
        return x384;
    }
    private runDecoder(): void {
        const w384 = this.captureAllChannels();
        switch (this.decodeProtocol) {
            case LogicDecodeProtocol.UART:
                this.decodeUart(w384);
                break;
            case LogicDecodeProtocol.I2C:
                this.decodeI2c(w384);
                break;
            case LogicDecodeProtocol.SPI:
                this.decodeSpi(w384);
                break;
            case LogicDecodeProtocol.CAN:
                this.decodeCan(w384);
                break;
        }
    }
    private decodeUart(i384: WaveData[]): void {
        if (i384.length === 0)
            return;
        const j384 = i384[0];
        const k384 = j384.voltageAxis;
        if (k384.length < 10)
            return;
        const l384 = this.sampleRate / this.baudRate;
        let m384 = 0;
        let n384 = 0;
        for (let v384 = 1; v384 < k384.length; v384++) {
            if (k384[v384 - 1] > this.threshold && k384[v384] <= this.threshold) {
                n384 = j384.timeAxis[v384];
                break;
            }
        }
        if (n384 === 0)
            return;
        const o384: number[] = [];
        for (let r384 = 0; r384 < 10; r384++) {
            const s384 = n384 + (r384 + 0.5) * l384 / this.sampleRate;
            const t384 = j384.timeAxis.findIndex(u384 => u384 >= s384);
            o384.push(t384 >= 0 && t384 < k384.length && k384[t384] > this.threshold ? 1 : 0);
        }
        if (o384[0] !== 0)
            return;
        let p384 = 0;
        for (let q384 = 0; q384 < 8; q384++)
            p384 |= (o384[q384 + 1] << q384);
        this.decodedFrames.push({
            timestamp: n384,
            protocol: 'UART',
            data: `0x${p384.toString(16).toUpperCase().padStart(2, '0')} '${String.fromCharCode(p384)}'`,
            raw: [p384]
        });
    }
    private decodeI2c(x383: WaveData[]): void {
        if (x383.length < 2)
            return;
        const y383 = x383[0].voltageAxis;
        const z383 = x383[1].voltageAxis;
        const a384 = x383[0].timeAxis;
        if (y383.length < 20 || z383.length < 20)
            return;
        let b384 = -1;
        for (let h384 = 1; h384 < Math.min(y383.length, z383.length); h384++) {
            if (z383[h384] > this.threshold && y383[h384 - 1] > this.threshold && y383[h384] <= this.threshold) {
                b384 = h384;
                break;
            }
        }
        if (b384 < 0)
            return;
        let c384 = 0;
        for (let f384 = 0; f384 < 9; f384++) {
            const g384 = b384 + f384 * 4 + 2;
            if (g384 < y383.length && z383[g384] > this.threshold) {
                c384 = (c384 << 1) | (y383[g384] > this.threshold ? 1 : 0);
            }
        }
        const d384 = (c384 >> 1) & 0x7F;
        const e384 = c384 & 1;
        this.decodedFrames.push({
            timestamp: a384[b384],
            protocol: 'I2C',
            data: `ADDR=0x${d384.toString(16)} ${e384 ? 'READ' : 'WRITE'}`,
            raw: [d384, e384]
        });
    }
    private decodeSpi(r383: WaveData[]): void {
        if (r383.length < 2)
            return;
        const s383 = r383[0].voltageAxis;
        const t383 = r383[1].voltageAxis;
        if (s383.length < 8 || t383.length < 8)
            return;
        let u383 = 0;
        for (let v383 = 0; v383 < 8; v383++) {
            const w383 = v383 * 4 + 2;
            if (w383 < s383.length && t383[w383] > this.threshold) {
                if (s383[w383] > this.threshold)
                    u383 |= (1 << (7 - v383));
            }
        }
        this.decodedFrames.push({
            timestamp: r383[0].timeAxis[0],
            protocol: 'SPI',
            data: `MOSI=0x${u383.toString(16).toUpperCase().padStart(2, '0')}`,
            raw: [u383]
        });
    }
    private decodeCan(i383: WaveData[]): void {
        if (i383.length === 0)
            return;
        const j383 = i383[0].voltageAxis;
        const k383 = i383[0].timeAxis;
        if (j383.length < 20)
            return;
        let l383 = -1;
        for (let q383 = 1; q383 < j383.length; q383++) {
            if (j383[q383 - 1] > this.threshold && j383[q383] <= this.threshold) {
                l383 = q383;
                break;
            }
        }
        if (l383 < 0)
            return;
        let m383 = 0;
        const n383 = 4;
        for (let o383 = 0; o383 < 11; o383++) {
            const p383 = l383 + (o383 + 1) * n383 + Math.floor(n383 / 2);
            if (p383 < j383.length && j383[p383] <= this.threshold)
                m383 |= (1 << (10 - o383));
        }
        this.decodedFrames.push({
            timestamp: k383[l383],
            protocol: 'CAN',
            data: `ID=0x${m383.toString(16).toUpperCase()} (Std 11-bit)`,
            raw: [m383 >> 8, m383 & 0xFF]
        });
    }
}
