/**
 * AI Pipeline 端到端验证器 — 本地可运行验收测试
 */
import {
  SchTopology, DeviceInst, NetInfo, NetNodeRef, ErrCode, ResultHelper, ApiResult,
  Logger, INSTR_TRACE_TAG, IdUtil, emptySchTopology, makeDeviceInst
} from 'common';
import { AiPipelineOrchestrator } from '../algorithms/AiPipelineOrchestrator';
import { DeviceSelectEngine } from '../algorithms/DeviceSelectEngine';
import {
  ModularPlan, ModularModuleSpec, ModularJointSpec,
  mergeModularTopologies, critiqueModularPlan, looksLikeLibIdAsRefDes
} from '../algorithms/ModularParallelMerge';
import { IComponentLibrary } from 'component_library';
import { DeviceUsageManual } from '../algorithms/DeviceUsageManual';
import { PromptLoader } from '../prompts/PromptLoader';

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
   * 模块并行合并：同名电源网须合并；joints 可用 libDevId 回退匹配位号。
   */
  validateModularMerge(): AiValidationResult {
    const checks: string[] = [];
    const failures: string[] = [];

    if (!looksLikeLibIdAsRefDes('LM555') || !looksLikeLibIdAsRefDes('LED_RED')) {
      failures.push('looksLikeLibIdAsRefDes 应识别 LM555/LED_RED');
    } else {
      checks.push('libId-as-RefDes 识别 OK');
    }
    if (looksLikeLibIdAsRefDes('U1') || looksLikeLibIdAsRefDes('D1') || looksLikeLibIdAsRefDes('LED1') ||
      looksLikeLibIdAsRefDes('SCOPE1') || looksLikeLibIdAsRefDes('AM1') || looksLikeLibIdAsRefDes('VM1')) {
      failures.push('looksLikeLibIdAsRefDes 误伤正常位号 U1/D1/LED1/SCOPE1/AM1/VM1');
    } else {
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
    } else {
      checks.push(`plan 门禁拒收型号当位号 (${critique.length} issues)`);
    }

    // 通用忠实度：用户未要求的重大有源/假脚须拒收
    const creepMod1: ModularModuleSpec = {
      id: 'M1',
      title: '激励',
      prompt: '放置 U1（libDevId=LM555）产生方波，边界 U1.3',
      boundaryPins: ['U1.3', 'U1.8', 'U1.1']
    };
    const creepMod2: ModularModuleSpec = {
      id: 'M2',
      title: '测量',
      prompt: '放置 RV1（libDevId=POT_10k）与 OSC1（libDevId=OSCILLOSCOPE），' +
        'OSC1 信号输入引脚（假设为A），RV1 端脚悬空',
      boundaryPins: ['RV1.1', 'OSC1.CH1']
    };
    const creepPlan: ModularPlan = {
      systemOverview: '555方波驱动负载并用示波器观测',
      modules: [creepMod1, creepMod2],
      joints: [
        { from: 'POWER.VCC', to: 'M1.U1.8' },
        { from: 'POWER.GND', to: 'M1.U1.1' },
        { from: 'M1.U1.3', to: 'M2.RV1.1' },
        { from: 'POWER.GND', to: 'M2.OSC1.CH1' }
      ]
    };
    const simpleUser = '电阻分压电路测中点电压';
    const creepCritique = critiqueModularPlan(creepPlan, this.library, simpleUser);
    const creepHit = creepCritique.some(s => s.indexOf('擅自') >= 0);
    const pinHit = creepCritique.some(s => s.indexOf('假设') >= 0 || s.indexOf('悬空') >= 0 ||
      s.indexOf('不属于') >= 0);
    if (!creepHit) {
      failures.push('critiqueModularPlan 未拒收用户未要求的重大器件扩容');
    } else {
      checks.push('通用忠实度门禁 OK');
    }
    if (!pinHit) {
      failures.push('critiqueModularPlan 未拒收假设脚/悬空/库外脚');
    } else {
      checks.push('库脚/假脚门禁 OK');
    }

    // 合法无源+示波 plan（用户点名观测）应通过
    const good1: ModularModuleSpec = {
      id: 'M1',
      title: 'RC网络',
      prompt: '放置 R1（libDevId=R_10k）与 C1（libDevId=C_10uF）：VCC—R1—电容节点—C1—GND',
      boundaryPins: ['R1.1', 'C1.2', 'R1.2']
    };
    const good2: ModularModuleSpec = {
      id: 'M2',
      title: '示波观测',
      prompt: '放置 OSC1（libDevId=OSCILLOSCOPE）：OSC1.CH1 接电容节点，OSC1.GND 接系统地',
      boundaryPins: ['OSC1.CH1', 'OSC1.GND']
    };
    const goodPlan: ModularPlan = {
      systemOverview: '无源 RC：VCC经R对C充电，示波器CH1观测电容电压',
      modules: [good1, good2],
      joints: [
        { from: 'POWER.VCC', to: 'M1.R1.1' },
        { from: 'POWER.GND', to: 'M1.C1.2' },
        { from: 'M1.R1.2', to: 'M2.OSC1.CH1' },
        { from: 'POWER.GND', to: 'M2.OSC1.GND' }
      ]
    };
    const goodUser = 'RC 充放电电路观测指数波形';
    const goodCritique = critiqueModularPlan(goodPlan, this.library, goodUser);
    if (goodCritique.length > 0) {
      failures.push(`合法 plan 被误拒: ${goodCritique.join('; ')}`);
    } else {
      checks.push('合法 plan 通过门禁');
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
    const vccNets = mergeOut.topology.netList.filter(
      n => (n.netName ?? '').toUpperCase() === 'VCC');
    const gndNets = mergeOut.topology.netList.filter(
      n => (n.netName ?? '').toUpperCase() === 'GND');
    if (vccNets.length !== 1) {
      failures.push(`合并后 VCC 网应唯一，实际 ${vccNets.length}`);
    } else {
      checks.push('VCC 网唯一');
    }
    if (gndNets.length !== 1) {
      failures.push(`合并后 GND 网应唯一，实际 ${gndNets.length}`);
    } else {
      checks.push('GND 网唯一');
    }
    if (mergeOut.jointFail > 0) {
      failures.push(`joints 应按 libDevId 回退命中，fail=${mergeOut.jointFail}: ` +
        mergeOut.jointFailReasons.join('; '));
    } else {
      checks.push(`joints ok=${mergeOut.jointOk}`);
    }
    const labelN = mergeOut.topology.netLabelList?.length ?? 0;
    if (mergeOut.jointOk > 0 && labelN < 2) {
      failures.push(`跨模块应使用网络标号并网，labels=${labelN}`);
    } else if (mergeOut.jointOk > 0) {
      checks.push(`网络标号 labels=${labelN}`);
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_VAL] validateModularMerge passed=${failures.length === 0}` +
      ` checks=${checks.length} failures=${failures.length}`);
    return {
      passed: failures.length === 0,
      checks,
      failures,
      topology: mergeOut.topology
    };
  }

  /**
   * 全库手册覆盖 + 选型后注入块非空 + 精确条目脚串↔库 pin.id
   */
  validateUsageManualCoverage(): AiValidationResult {
    const checks: string[] = [];
    const failures: string[] = [];
    const cov = DeviceUsageManual.coverageReport();
    if (cov.missing.length > 0) {
      failures.push(`手册未覆盖: ${cov.missing.join(',')}`);
    } else {
      checks.push(`手册全库覆盖 ${cov.covered.length}/${cov.total} (${cov.percent}%)`);
    }
    const sample = ['LM555', 'STM32F103C8', 'R_10k', 'OSCILLOSCOPE', 'AMMETER_DC'];
    const built = PromptLoader.buildDeviceUsageBlock(sample, 'full', this.library);
    if (built.text.indexOf('【本次选型器件使用说明') < 0) {
      failures.push('usage block 缺少标题头');
    } else {
      checks.push(`usage block chars=${built.charCount} devices=${built.deviceCount}`);
    }
    for (let i = 0; i < sample.length; i++) {
      if (built.text.indexOf(sample[i]) < 0) {
        failures.push(`usage block 缺少 ${sample[i]}`);
      }
    }
    if (failures.length === 0) {
      checks.push('sample libDevIds 均注入');
    }
    const pinAudit = DeviceUsageManual.auditExactPinsAgainstLibrary(this.library);
    for (let i = 0; i < pinAudit.length; i++) {
      failures.push(pinAudit[i]);
    }
    if (pinAudit.length === 0) {
      checks.push('精确手册脚串与库 pin.id 一致');
    }
    // 稳压/555 关键句式抽查
    const e7805 = DeviceUsageManual.resolve('LM7805');
    if (e7805 && e7805.pins.indexOf('1=IN') < 0) {
      failures.push('LM7805 手册须含 1=IN（库 pinId=1/2/3）');
    }
    const e555 = DeviceUsageManual.resolve('LM555');
    if (e555 && (e555.pins.indexOf('GND') < 0 || e555.typicalWiring.indexOf('DISCH') < 0)) {
      failures.push('LM555 手册须用具名脚 GND/DISCH（禁止裸数字接法）');
    }
    if (built.criticalMissIds && built.criticalMissIds.length > 0) {
      failures.push(`sample 出现 criticalMiss: ${built.criticalMissIds.join(',')}`);
    } else {
      checks.push('sample 无 criticalMiss');
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_VAL] validateUsageManualCoverage passed=${failures.length === 0}` +
      ` miss=${cov.missing.length} pinAudit=${pinAudit.length} chars=${built.charCount}`);
    return { passed: failures.length === 0, checks, failures };
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

  private static makeModuleTopo(
    chipRef: string, chipLib: string, vccNetId: string, gndNetId: string
  ): SchTopology {
    const topo = emptySchTopology();
    const chip = AiPipelineValidator.makeDev(chipLib, chipRef, 200, 200);
    const vcc = AiPipelineValidator.makeDev('VCC', 'VCC', 60, 80);
    const gnd = AiPipelineValidator.makeDev('GND', 'GND', 60, 400);
    topo.deviceList.push(chip, vcc, gnd);
    topo.netList.push(
      AiPipelineValidator.makeNet(vccNetId, 'VCC', [vcc, chip], true),
      AiPipelineValidator.makeNet(gndNetId, 'GND', [gnd, chip], true)
    );
    return topo;
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
