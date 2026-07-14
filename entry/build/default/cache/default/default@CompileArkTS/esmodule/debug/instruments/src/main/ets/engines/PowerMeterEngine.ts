/**
 * 功率表仿真引擎 — 电压 × 电流 = 功率
 * Light EMA on V/I so AC-driven readings stay live without raw flicker.
 */
const EMA_ALPHA = 0.4;
export class PowerMeterEngine {
    private voltage: number = 0;
    private current: number = 0;
    private power: number = 0;
    private apparentPower: number = 0;
    private powerFactor: number = 1.0;
    private frequency: number = 50;
    private voltageReader: (() => number) | null = null;
    private currentReader: (() => number) | null = null;
    private voltageFallback: (() => number) | null = null;
    private currentFallback: (() => number) | null = null;
    private vEma: number = 0;
    private iEma: number = 0;
    private emaInit: boolean = false;
    setVoltageReader(reader: (() => number) | null): void {
        this.voltageReader = reader;
        this.emaInit = false;
    }
    setCurrentReader(reader: (() => number) | null): void {
        this.currentReader = reader;
        this.emaInit = false;
    }
    setVoltageFallback(reader: (() => number) | null): void {
        this.voltageFallback = reader;
    }
    setCurrentFallback(reader: (() => number) | null): void {
        this.currentFallback = reader;
    }
    measure(): PowerReading {
        const vRaw = this.voltageReader !== null ? this.voltageReader() :
            (this.voltageFallback !== null ? this.voltageFallback() : 0);
        const iRaw = this.currentReader !== null ? this.currentReader() :
            (this.currentFallback !== null ? this.currentFallback() : 0);
        if (!this.emaInit) {
            this.vEma = vRaw;
            this.iEma = iRaw;
            this.emaInit = true;
        }
        else {
            this.vEma = EMA_ALPHA * vRaw + (1 - EMA_ALPHA) * this.vEma;
            this.iEma = EMA_ALPHA * iRaw + (1 - EMA_ALPHA) * this.iEma;
        }
        this.voltage = this.vEma;
        this.current = this.iEma;
        this.power = this.voltage * this.current;
        this.apparentPower = this.power;
        this.powerFactor = Math.abs(this.power) > 1e-18 ? 1.0 : 0;
        this.frequency = 50;
        return {
            voltage: this.voltage,
            current: this.current,
            power: this.power,
            apparentPower: this.apparentPower,
            powerFactor: this.powerFactor,
            frequency: this.frequency
        };
    }
    getLastVoltage(): number { return this.voltage; }
    getLastCurrent(): number { return this.current; }
    getLastPower(): number { return this.power; }
    getLastPowerFactor(): number { return this.powerFactor; }
    getLastFrequency(): number { return this.frequency; }
}
export interface PowerReading {
    voltage: number;
    current: number;
    power: number;
    apparentPower: number;
    powerFactor: number;
    frequency: number;
}
