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
    setVoltageReader(i393: (() => number) | null): void {
        this.voltageReader = i393;
    }
    setCurrentReader(h393: (() => number) | null): void {
        this.currentReader = h393;
    }
    setVoltageFallback(g393: (() => number) | null): void {
        this.voltageFallback = g393;
    }
    setCurrentFallback(f393: (() => number) | null): void {
        this.currentFallback = f393;
    }
    measure(): PowerReading {
        this.voltage = this.voltageReader !== null ? this.voltageReader() :
            (this.voltageFallback !== null ? this.voltageFallback() : 0);
        this.current = this.currentReader !== null ? this.currentReader() :
            (this.currentFallback !== null ? this.currentFallback() : 0);
        this.power = this.voltage * this.current;
        this.apparentPower = this.power;
        this.powerFactor = this.power > 0 ? 1.0 : 0;
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
