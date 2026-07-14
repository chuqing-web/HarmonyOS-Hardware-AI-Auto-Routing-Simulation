import { ErrCode, ResultHelper } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiPipelineOrchestrator } from '../algorithms/AiPipelineOrchestrator';
import { DeviceSelectEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/DeviceSelectEngine";
import type { IComponentLibrary } from 'component_library';
export interface AiValidationResult {
    passed: boolean;
    checks: string[];
    failures: string[];
    topology?: SchTopology;
}
export class AiPipelineValidator {
    private library: IComponentLibrary;
    private orchestrator: AiPipelineOrchestrator;
    private deviceSelect: DeviceSelectEngine;
    constructor(m315: IComponentLibrary, n315: AiPipelineOrchestrator) {
        this.library = m315;
        this.orchestrator = n315;
        this.deviceSelect = new DeviceSelectEngine(m315);
    }
    async validateMinSystemLed(): Promise<AiValidationResult> {
        const z314: string[] = [];
        const a315: string[] = [];
        const b315 = 'STM32F103 最小系统 + LED';
        const c315 = await this.orchestrator.runFullPipeline({ prompt: b315, skipLlm: true });
        if (!c315.topology || c315.topology.deviceList.length === 0) {
            a315.push('拓扑为空');
            return { passed: false, checks: z314, failures: a315 };
        }
        const d315 = c315.topology;
        z314.push(`器件数: ${d315.deviceList.length}`);
        for (let j315 = 0; j315 < d315.deviceList.length; j315++) {
            const k315 = d315.deviceList[j315];
            const l315 = this.library.getComponent(k315.libDevId);
            if (!l315.success)
                a315.push(`器件不在库: ${k315.libDevId}`);
            else
                z314.push(`库匹配: ${k315.libDevId}`);
        }
        const e315 = d315.deviceList.find(i315 => i315.libDevId.includes('STM32') || i315.libDevId.includes('AT89'));
        const f315 = d315.deviceList.find(h315 => h315.libDevId.includes('XTAL') || h315.libDevId.includes('晶振'));
        if (e315 && f315) {
            const g315 = Math.abs(e315.x - f315.x) + Math.abs(e315.y - f315.y);
            if (g315 <= 120)
                z314.push(`晶振距离: ${g315}mil`);
            else
                a315.push(`晶振距离过大: ${g315}mil > 120`);
        }
        if (d315.wireList.length > 0)
            z314.push(`布线数: ${d315.wireList.length}`);
        else
            a315.push('无布线');
        return { passed: a315.length === 0, checks: z314, failures: a315, topology: d315 };
    }
    validateHallucinationChip(): ApiResult<boolean> {
        const w314 = '使用 XYZ-99999 芯片';
        const x314 = DeviceSelectEngine.buildLocalLlmOutput(w314);
        const y314 = this.deviceSelect.matchFromLlmOutput(x314, w314);
        if (!y314.oodDetected) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '未检测到 OOD');
        }
        return ResultHelper.ok(true);
    }
    async validateApiFailureFallback(): Promise<AiValidationResult> {
        const t314: string[] = [];
        const u314: string[] = [];
        const v314 = await this.orchestrator.runFullPipeline({ prompt: 'STM32F103 最小系统', skipLlm: true });
        if (!v314.degradedMode && !v314.usedLlm)
            t314.push('降级模式');
        if (!v314.topology || v314.topology.deviceList.length < 2) {
            u314.push('降级布局器件不足');
        }
        else {
            t314.push(`降级器件: ${v314.topology.deviceList.length}`);
        }
        return { passed: u314.length === 0, checks: t314, failures: u314, topology: v314.topology };
    }
}
