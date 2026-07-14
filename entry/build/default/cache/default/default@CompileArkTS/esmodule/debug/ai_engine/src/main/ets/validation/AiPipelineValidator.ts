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
    constructor(library: IComponentLibrary, orchestrator: AiPipelineOrchestrator) {
        this.library = library;
        this.orchestrator = orchestrator;
        this.deviceSelect = new DeviceSelectEngine(library);
    }
    async validateMinSystemLed(): Promise<AiValidationResult> {
        const checks: string[] = [];
        const failures: string[] = [];
        const prompt = 'STM32F103 最小系统 + LED';
        const result = await this.orchestrator.runFullPipeline({ prompt, skipLlm: true });
        if (!result.topology || result.topology.deviceList.length === 0) {
            failures.push('拓扑为空');
            return { passed: false, checks, failures };
        }
        const topo = result.topology;
        checks.push(`器件数: ${topo.deviceList.length}`);
        for (let i = 0; i < topo.deviceList.length; i++) {
            const dev = topo.deviceList[i];
            const r = this.library.getComponent(dev.libDevId);
            if (!r.success)
                failures.push(`器件不在库: ${dev.libDevId}`);
            else
                checks.push(`库匹配: ${dev.libDevId}`);
        }
        const mcu = topo.deviceList.find(d => d.libDevId.includes('STM32') || d.libDevId.includes('AT89'));
        const xtal = topo.deviceList.find(d => d.libDevId.includes('XTAL') || d.libDevId.includes('晶振'));
        if (mcu && xtal) {
            const dist = Math.abs(mcu.x - xtal.x) + Math.abs(mcu.y - xtal.y);
            if (dist <= 120)
                checks.push(`晶振距离: ${dist}mil`);
            else
                failures.push(`晶振距离过大: ${dist}mil > 120`);
        }
        if (topo.wireList.length > 0)
            checks.push(`布线数: ${topo.wireList.length}`);
        else
            failures.push('无布线');
        return { passed: failures.length === 0, checks, failures, topology: topo };
    }
    validateHallucinationChip(): ApiResult<boolean> {
        const prompt = '使用 XYZ-99999 芯片';
        const local = DeviceSelectEngine.buildLocalLlmOutput(prompt);
        const match = this.deviceSelect.matchFromLlmOutput(local, prompt);
        if (!match.oodDetected) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '未检测到 OOD');
        }
        return ResultHelper.ok(true);
    }
    async validateApiFailureFallback(): Promise<AiValidationResult> {
        const checks: string[] = [];
        const failures: string[] = [];
        const result = await this.orchestrator.runFullPipeline({ prompt: 'STM32F103 最小系统', skipLlm: true });
        if (!result.degradedMode && !result.usedLlm)
            checks.push('降级模式');
        if (!result.topology || result.topology.deviceList.length < 2) {
            failures.push('降级布局器件不足');
        }
        else {
            checks.push(`降级器件: ${result.topology.deviceList.length}`);
        }
        return { passed: failures.length === 0, checks, failures, topology: result.topology };
    }
}
