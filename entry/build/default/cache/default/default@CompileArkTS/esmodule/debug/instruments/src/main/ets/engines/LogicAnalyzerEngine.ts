import { IdUtil, LogicDecodeProtocol, traceLaCapture } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { WaveData, DecodedFrame } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SignalGroup } from '../api/IVirtualInstruments';
const MAX_SAMPLES = 16384;
export class LogicAnalyzerEngine {
    private channelCount: number = 8;
    private threshold: number = 1.65;
    private decodeProtocol: LogicDecodeProtocol = LogicDecodeProtocol.UART;
    private baudRate: number = 115200;
    private signalGroups: SignalGroup[] = [];
    private decodedFrames: DecodedFrame[] = [];
    private simulationWaves: WaveData[] = [];
    private digitalStates: Map<string, number> = new Map();
    private sampleRate: number = 1e6; // 1 MHz default
    feedSimulationWaves(waves: WaveData[]): void {
        this.simulationWaves = waves.slice();
    }
    feedDigitalStates(states: Map<string, number>): void {
        this.digitalStates = new Map(states);
    }
    setChannels(count: number): void { this.channelCount = count; }
    setSampleRate(hz: number): void { this.sampleRate = Math.max(1000, hz); }
    setThreshold(mV: number): void { this.threshold = mV / 1000; }
    decodeBus(protocol: LogicDecodeProtocol, baudRate: number = 115200): void {
        this.decodeProtocol = protocol;
        this.baudRate = baudRate;
        this.decodedFrames = [];
        this.runDecoder();
    }
    groupSignals(groups: SignalGroup[]): void {
        this.signalGroups = groups.map((g: SignalGroup): SignalGroup => {
            const sg: SignalGroup = {
                name: g.name,
                channelIndices: g.channelIndices.slice()
            };
            return sg;
        });
    }
    getChannelCount(): number { return this.channelCount; }
    getThreshold(): number { return this.threshold * 1000; }
    getDecodeProtocol(): LogicDecodeProtocol { return this.decodeProtocol; }
    getBaudRate(): number { return this.baudRate; }
    getSignalGroups(): SignalGroup[] {
        return this.signalGroups.map((g: SignalGroup): SignalGroup => {
            const sg: SignalGroup = { name: g.name, channelIndices: g.channelIndices.slice() };
            return sg;
        });
    }
    getDecodedFrames(): DecodedFrame[] { return this.decodedFrames.slice(); }
    /** Capture channels bound to specific probe net UUIDs */
    captureChannelsForProbes(probeNets: string[]): WaveData[] {
        const waves: WaveData[] = [];
        const diagParts: string[] = [];
        const count = Math.min(this.channelCount, probeNets.length);
        for (let ch = 0; ch < count; ch++) {
            const probeNet = probeNets[ch];
            if (probeNet.length === 0) {
                diagParts.push(`CH${ch + 1}=empty`);
                continue;
            }
            let matched: WaveData | undefined = undefined;
            for (let i = 0; i < this.simulationWaves.length; i++) {
                const src = this.simulationWaves[i];
                if (this.waveMatchesProbe(src, probeNet)) {
                    matched = src;
                    break;
                }
            }
            if (matched !== undefined && matched.voltageAxis.length > 0) {
                const digitized = matched.voltageAxis.map(v => v > this.threshold ? 3.3 : 0);
                let edges = 0;
                let minV = matched.voltageAxis[0];
                let maxV = matched.voltageAxis[0];
                for (let j = 0; j < matched.voltageAxis.length; j++) {
                    const v = matched.voltageAxis[j];
                    if (v < minV)
                        minV = v;
                    if (v > maxV)
                        maxV = v;
                    if (j > 0) {
                        const prevH = matched.voltageAxis[j - 1] > this.threshold;
                        const curH = v > this.threshold;
                        if (prevH !== curH)
                            edges++;
                    }
                }
                const shortNet = probeNet.length > 16 ? probeNet.substring(probeNet.length - 12) : probeNet;
                const shortProbe = matched.probeName.length > 14
                    ? matched.probeName.substring(0, 14) : matched.probeName;
                diagParts.push(`CH${ch + 1}@${shortProbe}/…${shortNet} n=${matched.voltageAxis.length} ` +
                    `e=${edges} V=${minV.toFixed(2)}..${maxV.toFixed(2)}`);
                waves.push({
                    waveId: IdUtil.generate('la'),
                    probeName: `D${ch}`,
                    netName: probeNet,
                    timeAxis: matched.timeAxis.slice(),
                    voltageAxis: digitized,
                    currentAxis: new Array(digitized.length).fill(0),
                    sampleRate: matched.sampleRate,
                    waveType: 'digital',
                    holdTime: matched.holdTime
                });
            }
            else if (this.digitalStates.size > 0) {
                const level = (this.digitalStates.get(probeNet) ?? this.digitalStates.get(`D${ch}`) ?? 0) > 0.5 ? 3.3 : 0;
                const shortNet = probeNet.length > 16 ? probeNet.substring(probeNet.length - 12) : probeNet;
                diagParts.push(`CH${ch + 1}@FALLBACK/…${shortNet} lvl=${level > 0 ? 'H' : 'L'}`);
                waves.push({
                    waveId: IdUtil.generate('la'),
                    probeName: `D${ch}`,
                    netName: probeNet,
                    timeAxis: [0, 1e-3],
                    voltageAxis: [level, level],
                    currentAxis: [0, 0],
                    sampleRate: 1000,
                    waveType: 'digital',
                    holdTime: 1e-3
                });
            }
            else {
                const shortNet = probeNet.length > 16 ? probeNet.substring(probeNet.length - 12) : probeNet;
                diagParts.push(`CH${ch + 1}@MISS/…${shortNet} waves=${this.simulationWaves.length}`);
            }
        }
        if (diagParts.length > 0) {
            // Prefer CH7/CH8 (Q0/CLK) when present — those are the lab_digital focus
            const focus: string[] = [];
            for (let i = 0; i < diagParts.length; i++) {
                if (diagParts[i].startsWith('CH7') || diagParts[i].startsWith('CH8') ||
                    diagParts[i].startsWith('CH1')) {
                    focus.push(diagParts[i]);
                }
            }
            const body = focus.length > 0 ? focus.join('; ') : diagParts.slice(0, 4).join('; ');
            traceLaCapture(`${body} | simWaves=${this.simulationWaves.length}`);
        }
        if (waves.length > 0) {
            return waves;
        }
        return this.captureAllChannels();
    }
    private waveMatchesProbe(wave: WaveData, probeNet: string): boolean {
        if (probeNet.length === 0) {
            return false;
        }
        return wave.netName === probeNet || wave.probeName === probeNet;
    }
    /** Capture digitized waveforms from real simulation data */
    captureAllChannels(): WaveData[] {
        const waves: WaveData[] = [];
        // Use real simulation data if available
        if (this.simulationWaves.length > 0) {
            for (let ch = 0; ch < Math.min(this.channelCount, this.simulationWaves.length); ch++) {
                const src = this.simulationWaves[ch];
                if (src && src.voltageAxis.length > 0) {
                    // Digitize the analog waveform
                    const digitized = src.voltageAxis.map(v => v > this.threshold ? 3.3 : 0);
                    waves.push({
                        waveId: IdUtil.generate('la'),
                        probeName: `D${ch}`,
                        netName: src.netName,
                        timeAxis: src.timeAxis.slice(),
                        voltageAxis: digitized,
                        currentAxis: new Array(digitized.length).fill(0),
                        sampleRate: src.sampleRate,
                        waveType: 'digital',
                        holdTime: src.holdTime
                    });
                }
            }
            return waves;
        }
        // Use digital states keyed by net UUID / node name
        if (this.digitalStates.size > 0) {
            const keys: string[] = [];
            this.digitalStates.forEach((_level: number, key: string) => {
                const upper = key.toUpperCase();
                if (upper !== '0' && upper !== 'GND' && upper !== 'VCC' && upper !== 'VDD') {
                    keys.push(key);
                }
            });
            for (let ch = 0; ch < this.channelCount; ch++) {
                const key = ch < keys.length ? keys[ch] : `D${ch}`;
                const level = (this.digitalStates.get(key) ?? 0) > 0.5 ? 3.3 : 0;
                const timeAxis = [0, 1e-3];
                const voltageAxis = [level, level];
                waves.push({
                    waveId: IdUtil.generate('la'),
                    probeName: `D${ch}`,
                    netName: key,
                    timeAxis, voltageAxis,
                    currentAxis: [0, 0],
                    sampleRate: 1000,
                    waveType: 'digital',
                    holdTime: 1e-3
                });
            }
            return waves;
        }
        // No data — return flat channels
        for (let ch = 0; ch < this.channelCount; ch++) {
            const timeAxis = [0, 1e-3];
            waves.push({
                waveId: IdUtil.generate('la'),
                probeName: `D${ch}`,
                netName: `LOGIC_D${ch}`,
                timeAxis, voltageAxis: [0, 0],
                currentAxis: [0, 0],
                sampleRate: 1000,
                waveType: 'digital',
                holdTime: 1e-3
            });
        }
        return waves;
    }
    // ---- Protocol decoders on real data ----
    private runDecoder(): void {
        const waves = this.captureAllChannels();
        switch (this.decodeProtocol) {
            case LogicDecodeProtocol.UART:
                this.decodeUart(waves);
                break;
            case LogicDecodeProtocol.I2C:
                this.decodeI2c(waves);
                break;
            case LogicDecodeProtocol.SPI:
                this.decodeSpi(waves);
                break;
            case LogicDecodeProtocol.CAN:
                this.decodeCan(waves);
                break;
        }
    }
    private decodeUart(waves: WaveData[]): void {
        if (waves.length === 0)
            return;
        const ch = waves[0]; // RX on D0
        const raw = ch.voltageAxis;
        if (raw.length < 10)
            return;
        const bitPeriod = this.sampleRate / this.baudRate;
        let bitIdx = 0;
        let t = 0;
        // Find start bit (falling edge)
        for (let i = 1; i < raw.length; i++) {
            if (raw[i - 1] > this.threshold && raw[i] <= this.threshold) {
                t = ch.timeAxis[i];
                break;
            }
        }
        if (t === 0)
            return;
        // Sample 10 bits (start + 8 data + stop)
        const bits: number[] = [];
        for (let b = 0; b < 10; b++) {
            const sampleTime = t + (b + 0.5) * bitPeriod / this.sampleRate;
            const si = ch.timeAxis.findIndex(ti => ti >= sampleTime);
            bits.push(si >= 0 && si < raw.length && raw[si] > this.threshold ? 1 : 0);
        }
        if (bits[0] !== 0)
            return; // Not a proper start bit
        let byte = 0;
        for (let b = 0; b < 8; b++)
            byte |= (bits[b + 1] << b);
        this.decodedFrames.push({
            timestamp: t,
            protocol: 'UART',
            data: `0x${byte.toString(16).toUpperCase().padStart(2, '0')} '${String.fromCharCode(byte)}'`,
            raw: [byte]
        });
    }
    private decodeI2c(waves: WaveData[]): void {
        if (waves.length < 2)
            return;
        const sda = waves[0].voltageAxis;
        const scl = waves[1].voltageAxis;
        const timeAxis = waves[0].timeAxis;
        if (sda.length < 20 || scl.length < 20)
            return;
        // Find START condition: SDA falls while SCL is high
        let startIdx = -1;
        for (let i = 1; i < Math.min(sda.length, scl.length); i++) {
            if (scl[i] > this.threshold && sda[i - 1] > this.threshold && sda[i] <= this.threshold) {
                startIdx = i;
                break;
            }
        }
        if (startIdx < 0)
            return;
        // Sample 8 address bits + R/W + ACK
        let bits = 0;
        for (let b = 0; b < 9; b++) {
            // Each bit: sample SDA on rising edge of SCL
            const idx = startIdx + b * 4 + 2;
            if (idx < sda.length && scl[idx] > this.threshold) {
                bits = (bits << 1) | (sda[idx] > this.threshold ? 1 : 0);
            }
        }
        const addr = (bits >> 1) & 0x7F;
        const rw = bits & 1;
        this.decodedFrames.push({
            timestamp: timeAxis[startIdx],
            protocol: 'I2C',
            data: `ADDR=0x${addr.toString(16)} ${rw ? 'READ' : 'WRITE'}`,
            raw: [addr, rw]
        });
    }
    private decodeSpi(waves: WaveData[]): void {
        if (waves.length < 2)
            return;
        const mosi = waves[0].voltageAxis; // D0 = MOSI
        const sclk = waves[1].voltageAxis; // D1 = SCLK
        if (mosi.length < 8 || sclk.length < 8)
            return;
        // Sample MOSI on each SCLK rising edge
        let byte = 0;
        for (let b = 0; b < 8; b++) {
            const idx = b * 4 + 2;
            if (idx < mosi.length && sclk[idx] > this.threshold) {
                if (mosi[idx] > this.threshold)
                    byte |= (1 << (7 - b));
            }
        }
        this.decodedFrames.push({
            timestamp: waves[0].timeAxis[0],
            protocol: 'SPI',
            data: `MOSI=0x${byte.toString(16).toUpperCase().padStart(2, '0')}`,
            raw: [byte]
        });
    }
    private decodeCan(waves: WaveData[]): void {
        if (waves.length === 0)
            return;
        // CAN frames have dominant (0) / recessive (1) levels
        // Sample the first frame
        const rx = waves[0].voltageAxis;
        const times = waves[0].timeAxis;
        if (rx.length < 20)
            return;
        // Find SOF (recessive→dominant transition)
        let sof = -1;
        for (let i = 1; i < rx.length; i++) {
            if (rx[i - 1] > this.threshold && rx[i] <= this.threshold) {
                sof = i;
                break;
            }
        }
        if (sof < 0)
            return;
        // Rough CAN ID extraction (11-bit standard ID field)
        let canId = 0;
        const bitLen = 4; // samples per bit at this sample rate
        for (let b = 0; b < 11; b++) {
            const idx = sof + (b + 1) * bitLen + Math.floor(bitLen / 2);
            if (idx < rx.length && rx[idx] <= this.threshold)
                canId |= (1 << (10 - b));
        }
        this.decodedFrames.push({
            timestamp: times[sof],
            protocol: 'CAN',
            data: `ID=0x${canId.toString(16).toUpperCase()} (Std 11-bit)`,
            raw: [canId >> 8, canId & 0xFF]
        });
    }
}
