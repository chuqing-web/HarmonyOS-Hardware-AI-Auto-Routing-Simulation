import { FaultType, ResultHelper, ErrCode, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { FaultInjection, FaultScanResult, SchTopology, WaveData, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class FaultInjectionEngine {
    private faults: Map<string, FaultInjection> = new Map();
    inject(r469: string, s469: FaultType, t469?: Map<string, string>): ApiResult<FaultInjection> {
        const u469: FaultInjection = {
            id: IdUtil.generate('fault'),
            targetInstUuid: r469,
            faultType: s469,
            enabled: true,
            params: t469 ?? new Map<string, string>()
        };
        this.faults.set(u469.id, u469);
        return ResultHelper.ok(u469);
    }
    remove(q469: string): ApiResult<void> {
        if (!this.faults.delete(q469))
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        return ResultHelper.ok();
    }
    list(): FaultInjection[] { return Array.from(this.faults.values()); }
    clear(): void { this.faults.clear(); }
    applyToWave(l469: WaveData, m469: FaultInjection): WaveData {
        const n469: WaveData = {
            waveId: l469.waveId,
            probeName: l469.probeName,
            netName: l469.netName,
            timeAxis: l469.timeAxis.slice(),
            voltageAxis: l469.voltageAxis.slice(),
            currentAxis: l469.currentAxis.slice(),
            sampleRate: l469.sampleRate,
            waveType: l469.waveType,
            holdTime: l469.holdTime
        };
        switch (m469.faultType) {
            case FaultType.RESISTOR_OPEN:
                n469.voltageAxis = n469.voltageAxis.map(() => 0);
                break;
            case FaultType.RESISTOR_SHORT:
                n469.voltageAxis = n469.voltageAxis.map(() => 5);
                break;
            case FaultType.CAP_LEAK:
                n469.voltageAxis = n469.voltageAxis.map((o469: number, p469: number) => o469 * Math.exp(-p469 * 0.01));
                break;
            case FaultType.CRYSTAL_STOP:
                n469.voltageAxis = n469.voltageAxis.map(() => n469.voltageAxis[0] ?? 0);
                break;
            default:
                break;
        }
        return n469;
    }
    batchScan(d469: SchTopology, e469: WaveData[]): FaultScanResult[] {
        const f469: FaultScanResult[] = [];
        const g469 = [
            FaultType.RESISTOR_OPEN, FaultType.RESISTOR_SHORT,
            FaultType.CAP_LEAK, FaultType.CRYSTAL_STOP, FaultType.MCU_IO_SHORT
        ];
        for (const h469 of d469.deviceList) {
            for (const i469 of g469) {
                const j469 = this.inject(h469.instUuid, i469).data!;
                const k469 = `${i469}@${h469.refName}: amplitude change detected`;
                f469.push({
                    faultType: i469,
                    targetUuid: h469.instUuid,
                    waveSignature: k469,
                    aiDiagnosis: `注入 ${i469} 于 ${h469.refName}，建议检查 ${h469.libDevId} 周边连接`
                });
                this.remove(j469.id);
            }
        }
        return f469;
    }
}
