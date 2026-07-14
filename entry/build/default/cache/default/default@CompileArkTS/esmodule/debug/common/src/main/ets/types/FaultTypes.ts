/**
 * 故障注入仿真类型
 */
export enum FaultType {
    RESISTOR_OPEN = "resistor_open",
    RESISTOR_SHORT = "resistor_short",
    CAP_LEAK = "cap_leak",
    INDUCTOR_OPEN = "inductor_open",
    TRANSISTOR_BREAKDOWN = "transistor_breakdown",
    MOS_DAMAGE = "mos_damage",
    MCU_IO_SHORT = "mcu_io_short",
    CRYSTAL_STOP = "crystal_stop",
    RESET_STUCK = "reset_stuck"
}
export interface FaultInjection {
    id: string;
    targetInstUuid: string;
    faultType: FaultType;
    enabled: boolean;
    params: Map<string, string>;
}
export interface FaultScanResult {
    faultType: FaultType;
    targetUuid: string;
    waveSignature: string;
    aiDiagnosis: string;
}
