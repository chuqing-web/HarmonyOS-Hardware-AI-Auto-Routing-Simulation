/**
 * AI Pipeline 端到端验证器 — 本地可运行验收测试
 */
import {
  SchTopology, ErrCode, ResultHelper, ApiResult, Logger, INSTR_TRACE_TAG
} from 'common';
import { AiPipelineOrchestrator } from '../algorithms/AiPipelineOrchestrator';
import { DeviceSelectEngine } from '../algorithms/DeviceSelectEngine';
import { IComponentLibrary } from 'component_library';

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
    Logger.info(INSTR_TRACE_TAG, `[AI_VAL] validateMinSystemLed START skipLlm=true`);
    const result = await this.orchestrator.runFullPipeline({ prompt, skipLlm: true });
    if (!result.topology || result.topology.deviceList.length === 0) {
      failures.push('拓扑为空');
      Logger.error(INSTR_TRACE_TAG, '[AI_VAL] validateMinSystemLed FAIL empty topo');
      return { passed: false, checks, failures };
    }
    const topo = result.topology;
    checks.push(`器件数: ${topo.deviceList.length}`);

    for (let i = 0; i < topo.deviceList.length; i++) {
      const dev = topo.deviceList[i];
      const r = this.library.getComponent(dev.libDevId);
      if (!r.success) failures.push(`器件不在库: ${dev.libDevId}`);
      else checks.push(`库匹配: ${dev.libDevId}`);
    }

    const mcu = topo.deviceList.find(d => d.libDevId.includes('STM32') || d.libDevId.includes('AT89'));
    const xtal = topo.deviceList.find(d => d.libDevId.includes('XTAL') || d.libDevId.includes('晶振'));
    if (mcu && xtal) {
      const dist = Math.abs(mcu.x - xtal.x) + Math.abs(mcu.y - xtal.y);
      if (dist <= 120) checks.push(`晶振距离: ${dist}mil`);
      else failures.push(`晶振距离过大: ${dist}mil > 120`);
    }

    if (topo.wireList.length > 0) checks.push(`布线数: ${topo.wireList.length}`);
    else failures.push('无布线');

    Logger.info(INSTR_TRACE_TAG,
      `[AI_VAL] validateMinSystemLed END passed=${failures.length === 0}` +
      ` devices=${topo.deviceList.length} wires=${topo.wireList.length}`);
    return { passed: failures.length === 0, checks, failures, topology: topo };
  }

  validateHallucinationChip(): ApiResult<boolean> {
    const prompt = '使用 XYZ-99999 芯片';
    const local = DeviceSelectEngine.buildLocalLlmOutput(prompt);
    const match = this.deviceSelect.matchFromLlmOutput(local, prompt);
    if (!match.oodDetected) {
      Logger.error(INSTR_TRACE_TAG, '[AI_VAL] hallucination OOD not detected');
      return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, '未检测到 OOD');
    }
    Logger.info(INSTR_TRACE_TAG, '[AI_VAL] hallucination OOD OK');
    return ResultHelper.ok(true);
  }

  /**
   * 验证：生产路径（skipLlm=false）在无可用 LLM 时不得静默输出模板拓扑。
   */
  async validateApiFailureFallback(): Promise<AiValidationResult> {
    const checks: string[] = [];
    const failures: string[] = [];
    Logger.info(INSTR_TRACE_TAG,
      '[AI_VAL] validateNoTemplateFallback START skipLlm=false');
    const result = await this.orchestrator.runFullPipeline({
      prompt: 'STM32F103 最小系统',
      skipLlm: false
    });
    if (result.usedLlm) {
      checks.push('LLM 可用并完成选型');
      if (!result.topology || result.topology.deviceList.length < 1) {
        failures.push('LLM 成功但拓扑为空');
      } else {
        checks.push(`LLM 器件: ${result.topology.deviceList.length}`);
      }
    } else if (!result.topology || result.topology.deviceList.length === 0) {
      checks.push('API 不可用时拒绝落图(无模板回退)');
    } else {
      failures.push('API 不可用时仍输出了拓扑(存在回退)');
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_VAL] validateNoTemplateFallback END passed=${failures.length === 0}` +
      ` usedLlm=${result.usedLlm} devices=${result.topology?.deviceList.length ?? 0}`);
    return { passed: failures.length === 0, checks, failures, topology: result.topology };
  }
}
