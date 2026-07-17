import { ErrCode, ResultHelper, Logger, INSTR_TRACE_TAG, IdUtil, emptySchTopology, makeDeviceInst } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, DeviceInst, NetInfo, NetNodeRef, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { AiPipelineOrchestrator } from '../algorithms/AiPipelineOrchestrator';
import { DeviceSelectEngine } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/DeviceSelectEngine";
import { mergeModularTopologies, critiqueModularPlan, looksLikeLibIdAsRefDes } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/ModularParallelMerge";
import type { ModularPlan, ModularModuleSpec, ModularJointSpec } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/ModularParallelMerge";
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
        Logger.info(INSTR_TRACE_TAG, `[AI_VAL] validateMinSystemLed END passed=${failures.length === 0}` +
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
     * 模块并行合并：同名电源网须合并；joints 可用 libDevId 回退匹配位号。
     */
    validateModularMerge(): AiValidationResult {
        const checks: string[] = [];
        const failures: string[] = [];
        if (!looksLikeLibIdAsRefDes('LM555') || !looksLikeLibIdAsRefDes('LED_RED')) {
            failures.push('looksLikeLibIdAsRefDes 应识别 LM555/LED_RED');
        }
        else {
            checks.push('libId-as-RefDes 识别 OK');
        }
        if (looksLikeLibIdAsRefDes('U1') || looksLikeLibIdAsRefDes('D1') || looksLikeLibIdAsRefDes('LED1')) {
            failures.push('looksLikeLibIdAsRefDes 误伤正常位号 U1/D1/LED1');
        }
        else {
            checks.push('正常位号豁免 OK');
        }
        const badMod1: ModularModuleSpec = {
            id: 'M1',
            title: '振荡',
            prompt: '放置 LM555 与阻容构成无稳态，边界 U1.OUT',
            boundaryPins: ['LM555.OUT']
        };
        const badMod2: ModularModuleSpec = {
            id: 'M2',
            title: '指示',
            prompt: '放置 LED_RED 限流电阻，边界 D1.A',
            boundaryPins: ['LED_RED.A']
        };
        const badJoint0: ModularJointSpec = { from: 'M1.LM555.OUT', to: 'M2.LED_RED.A' };
        const badJoint1: ModularJointSpec = { from: 'POWER.VCC', to: 'M1.LM555.OUT' };
        const badJoint2: ModularJointSpec = { from: 'POWER.GND', to: 'M2.LED_RED.A' };
        const badPlan: ModularPlan = {
            systemOverview: '555 无稳态振荡驱动 LED，电源接 VCC/GND',
            modules: [badMod1, badMod2],
            joints: [badJoint0, badJoint1, badJoint2]
        };
        const critique = critiqueModularPlan(badPlan, this.library);
        const libAsRefHit = critique.some(s => s.indexOf('libDevId') >= 0 || s.indexOf('型号') >= 0);
        if (!libAsRefHit) {
            failures.push('critiqueModularPlan 未拒收把 LM555/LED_RED 当 RefDes');
        }
        else {
            checks.push(`plan 门禁拒收型号当位号 (${critique.length} issues)`);
        }
        const m1 = AiPipelineValidator.makeModuleTopo('U1', 'LM555', 'net_vcc_m1', 'net_gnd_m1');
        const m2 = AiPipelineValidator.makeModuleTopo('D1', 'LED_RED', 'net_vcc_m2', 'net_gnd_m2');
        const goodMod1: ModularModuleSpec = {
            id: 'M1',
            title: '振荡',
            prompt: '放置 U1=LM555 无稳态，边界 U1.3',
            boundaryPins: ['U1.3']
        };
        const goodMod2: ModularModuleSpec = {
            id: 'M2',
            title: '指示',
            prompt: '放置 D1=LED_RED，边界 D1.A',
            boundaryPins: ['D1.A']
        };
        const goodJoint0: ModularJointSpec = { from: 'M1.LM555.3', to: 'M2.LED_RED.A' };
        const goodJoint1: ModularJointSpec = { from: 'POWER.VCC', to: 'M1.U1.3' };
        const goodJoint2: ModularJointSpec = { from: 'POWER.GND', to: 'M2.D1.A' };
        const plan: ModularPlan = {
            systemOverview: '555 驱动 LED 指示灯，双模块电源共享',
            modules: [goodMod1, goodMod2],
            joints: [goodJoint0, goodJoint1, goodJoint2]
        };
        const mergeOut = mergeModularTopologies([m1, m2], plan, (_lib: string, hint: string) => {
            return hint && hint.length > 0 ? '1' : '1';
        });
        const vccNets = mergeOut.topology.netList.filter(n => (n.netName ?? '').toUpperCase() === 'VCC');
        const gndNets = mergeOut.topology.netList.filter(n => (n.netName ?? '').toUpperCase() === 'GND');
        if (vccNets.length !== 1) {
            failures.push(`合并后 VCC 网应唯一，实际 ${vccNets.length}`);
        }
        else {
            checks.push('VCC 网唯一');
        }
        if (gndNets.length !== 1) {
            failures.push(`合并后 GND 网应唯一，实际 ${gndNets.length}`);
        }
        else {
            checks.push('GND 网唯一');
        }
        if (mergeOut.jointFail > 0) {
            failures.push(`joints 应按 libDevId 回退命中，fail=${mergeOut.jointFail}: ` +
                mergeOut.jointFailReasons.join('; '));
        }
        else {
            checks.push(`joints ok=${mergeOut.jointOk}`);
        }
        const labelN = mergeOut.topology.netLabelList?.length ?? 0;
        if (mergeOut.jointOk > 0 && labelN < 2) {
            failures.push(`跨模块应使用网络标号并网，labels=${labelN}`);
        }
        else if (mergeOut.jointOk > 0) {
            checks.push(`网络标号 labels=${labelN}`);
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_VAL] validateModularMerge passed=${failures.length === 0}` +
            ` checks=${checks.length} failures=${failures.length}`);
        return {
            passed: failures.length === 0,
            checks,
            failures,
            topology: mergeOut.topology
        };
    }
    private static makeDev(libDevId: string, refName: string, x: number, y: number): DeviceInst {
        return makeDeviceInst(IdUtil.generate('d'), libDevId, refName, x, y, 0, new Map<string, string>());
    }
    private static makeNet(uuid: string, name: string, nodes: DeviceInst[], isPower: boolean): NetInfo {
        const nodeList: NetNodeRef[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const node: NetNodeRef = {
                devUuid: nodes[i].instUuid,
                pinId: '1',
                pinName: '1'
            };
            nodeList.push(node);
        }
        const net: NetInfo = {
            netUuid: uuid,
            netName: name,
            displayName: name,
            nodeList: nodeList,
            isPower,
            isAnalog: false,
            isBusMember: false,
            busParentUuid: '',
            defaultVoltage: 0,
            ercWarning: false,
            connectedProbeIds: []
        };
        return net;
    }
    private static makeModuleTopo(chipRef: string, chipLib: string, vccNetId: string, gndNetId: string): SchTopology {
        const topo = emptySchTopology();
        const chip = AiPipelineValidator.makeDev(chipLib, chipRef, 200, 200);
        const vcc = AiPipelineValidator.makeDev('VCC', 'VCC', 60, 80);
        const gnd = AiPipelineValidator.makeDev('GND', 'GND', 60, 400);
        topo.deviceList.push(chip, vcc, gnd);
        topo.netList.push(AiPipelineValidator.makeNet(vccNetId, 'VCC', [vcc, chip], true), AiPipelineValidator.makeNet(gndNetId, 'GND', [gnd, chip], true));
        return topo;
    }
    /**
     * 验证：生产路径（skipLlm=false）在无可用 LLM 时不得静默输出模板拓扑。
     */
    async validateApiFailureFallback(): Promise<AiValidationResult> {
        const checks: string[] = [];
        const failures: string[] = [];
        Logger.info(INSTR_TRACE_TAG, '[AI_VAL] validateNoTemplateFallback START skipLlm=false');
        const result = await this.orchestrator.runFullPipeline({
            prompt: 'STM32F103 最小系统',
            skipLlm: false
        });
        if (result.usedLlm) {
            checks.push('LLM 可用并完成选型');
            if (!result.topology || result.topology.deviceList.length < 1) {
                failures.push('LLM 成功但拓扑为空');
            }
            else {
                checks.push(`LLM 器件: ${result.topology.deviceList.length}`);
            }
        }
        else if (!result.topology || result.topology.deviceList.length === 0) {
            checks.push('API 不可用时拒绝落图(无模板回退)');
        }
        else {
            failures.push('API 不可用时仍输出了拓扑(存在回退)');
        }
        Logger.info(INSTR_TRACE_TAG, `[AI_VAL] validateNoTemplateFallback END passed=${failures.length === 0}` +
            ` usedLlm=${result.usedLlm} devices=${result.topology?.deviceList.length ?? 0}`);
        return { passed: failures.length === 0, checks, failures, topology: result.topology };
    }
}
