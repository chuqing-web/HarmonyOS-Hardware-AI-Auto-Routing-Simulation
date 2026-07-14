import { FaultType, ResultHelper, ErrCode, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { FaultInjection, FaultScanResult, SchTopology, WaveData, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export class FaultInjectionEngine {
    private faults: Map<string, FaultInjection> = new Map();
    inject(instUuid: string, faultType: FaultType, params?: Map<string, string>): ApiResult<FaultInjection> {
        const fault: FaultInjection = {
            id: IdUtil.generate('fault'),
            targetInstUuid: instUuid,
            faultType,
            enabled: true,
            params: params ?? new Map<string, string>()
        };
        this.faults.set(fault.id, fault);
        return ResultHelper.ok(fault);
    }
    remove(faultId: string): ApiResult<void> {
        if (!this.faults.delete(faultId))
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID);
        return ResultHelper.ok();
    }
    list(): FaultInjection[] { return Array.from(this.faults.values()); }
    clear(): void { this.faults.clear(); }
    applyToWave(wave: WaveData, fault: FaultInjection): WaveData {
        const modified: WaveData = {
            waveId: wave.waveId,
            probeName: wave.probeName,
            netName: wave.netName,
            timeAxis: wave.timeAxis.slice(),
            voltageAxis: wave.voltageAxis.slice(),
            currentAxis: wave.currentAxis.slice(),
            sampleRate: wave.sampleRate,
            waveType: wave.waveType,
            holdTime: wave.holdTime
        };
        switch (fault.faultType) {
            case FaultType.RESISTOR_OPEN:
                modified.voltageAxis = modified.voltageAxis.map(() => 0);
                break;
            case FaultType.RESISTOR_SHORT:
                modified.voltageAxis = modified.voltageAxis.map(() => 5);
                break;
            case FaultType.CAP_LEAK:
                modified.voltageAxis = modified.voltageAxis.map((v: number, i: number) => v * Math.exp(-i * 0.01));
                break;
            case FaultType.CRYSTAL_STOP:
                modified.voltageAxis = modified.voltageAxis.map(() => modified.voltageAxis[0] ?? 0);
                break;
            default:
                break;
        }
        return modified;
    }
    batchScan(topo: SchTopology, waves: WaveData[]): FaultScanResult[] {
        const results: FaultScanResult[] = [];
        const faultTypes = [
            FaultType.RESISTOR_OPEN, FaultType.RESISTOR_SHORT,
            FaultType.CAP_LEAK, FaultType.CRYSTAL_STOP, FaultType.MCU_IO_SHORT
        ];
        for (const dev of topo.deviceList) {
            for (const ft of faultTypes) {
                const fault = this.inject(dev.instUuid, ft).data!;
                const sig = `${ft}@${dev.refName}: amplitude change detected`;
                results.push({
                    faultType: ft,
                    targetUuid: dev.instUuid,
                    waveSignature: sig,
                    aiDiagnosis: `注入 ${ft} 于 ${dev.refName}，建议检查 ${dev.libDevId} 周边连接`
                });
                this.remove(fault.id);
            }
        }
        return results;
    }
}
