/**
 * 功率表仿真引擎 — 电压 × 电流 = 功率
 */
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

  setVoltageReader(reader: (() => number) | null): void {
    this.voltageReader = reader;
  }

  setCurrentReader(reader: (() => number) | null): void {
    this.currentReader = reader;
  }

  /** Set global fallback for voltage — used when no explicit voltage reader is configured */
  setVoltageFallback(reader: (() => number) | null): void {
    this.voltageFallback = reader;
  }

  /** Set global fallback for current — used when no explicit current reader is configured */
  setCurrentFallback(reader: (() => number) | null): void {
    this.currentFallback = reader;
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
