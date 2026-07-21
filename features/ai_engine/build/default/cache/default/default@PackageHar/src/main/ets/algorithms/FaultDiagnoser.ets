/**
 * AI 电路故障静态诊断 v2.1 — 扩展 ERC 规则集
 * 新增: 浮空引脚检测、电源完整性、短路检测、扇出过载、仪器拓扑校验
 */
import {
  SchematicDocument, ErcViolation, ErcSeverity, ErcRuleType, IdUtil, paramMapGet, Net, NetType,
  parsePinRef, ComponentInstance
} from 'common';
import { ErcEngine } from 'common';

const MCU_IDS = new Set([
  'AT89C51', 'AT89C52', 'STC89C52', 'STC15W408AS',
  'STM32F103C8', 'STM32F103RC', 'STM32F407VG', 'STM32L431CB', 'STM32F030F4'
]);

const VCC_NAMES = new Set(['VCC', 'VDD', '3V3', '3.3V', '5V', 'VCC_5V', 'VCC_3V3']);
const GND_NAMES = new Set(['GND', 'VSS', '0V', 'GROUND', 'DGND', 'AGND']);

export class FaultDiagnoser {
  static diagnose(schematic: SchematicDocument): ErcViolation[] {
    const violations = ErcEngine.run(schematic, MCU_IDS);

    // L1: 致命错误
    const paramViolations = FaultDiagnoser.checkParamMismatch(schematic);
    for (let i = 0; i < paramViolations.length; i++) {
      violations.push(paramViolations[i]);
    }
    const ioViolations = FaultDiagnoser.checkIoRisks(schematic);
    for (let i = 0; i < ioViolations.length; i++) {
      violations.push(ioViolations[i]);
    }
    const shortViolations = FaultDiagnoser.checkShortCircuits(schematic);
    for (let i = 0; i < shortViolations.length; i++) {
      violations.push(shortViolations[i]);
    }
    const nameAbuseViolations = FaultDiagnoser.checkPowerNameAbuse(schematic);
    for (let i = 0; i < nameAbuseViolations.length; i++) {
      violations.push(nameAbuseViolations[i]);
    }
    const fullFloatViolations = FaultDiagnoser.checkFullyFloatingComponent(schematic);
    for (let i = 0; i < fullFloatViolations.length; i++) {
      violations.push(fullFloatViolations[i]);
    }

    // L2: 严重警告
    const floatingViolations = FaultDiagnoser.checkFloatingPins(schematic);
    for (let i = 0; i < floatingViolations.length; i++) {
      violations.push(floatingViolations[i]);
    }
    const powerViolations = FaultDiagnoser.checkPowerIntegrity(schematic);
    for (let i = 0; i < powerViolations.length; i++) {
      violations.push(powerViolations[i]);
    }
    const fanoutViolations = FaultDiagnoser.checkFanout(schematic);
    for (let i = 0; i < fanoutViolations.length; i++) {
      violations.push(fanoutViolations[i]);
    }
    const topoViolations = FaultDiagnoser.checkInstrumentTopology(schematic);
    for (let i = 0; i < topoViolations.length; i++) {
      violations.push(topoViolations[i]);
    }
    const gpioPowerViolations = FaultDiagnoser.checkGpioDirectPower(schematic);
    for (let i = 0; i < gpioPowerViolations.length; i++) {
      violations.push(gpioPowerViolations[i]);
    }

    // L3: 建议
    const capVoltageViolations = FaultDiagnoser.checkCapVoltage(schematic);
    for (let i = 0; i < capVoltageViolations.length; i++) {
      violations.push(capVoltageViolations[i]);
    }

    return violations;
  }

  // ---- L1: 致命错误 ----

  private static checkParamMismatch(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    for (const comp of doc.components) {
      // 仅检查与 LED 真正共网、且另一端接电源/地/驱动的串联限流电阻
      if (comp.libraryId.startsWith('R_')) {
        const ledsOnPath = FaultDiagnoser.ledsLikelyLimitedByResistor(doc, comp);
        if (ledsOnPath.length > 0) {
          const val = paramMapGet(comp.parameters, 'value', comp.libraryId.replace('R_', ''));
          const ohm = FaultDiagnoser.parseOhmRough(val);
          if (ohm > 10000) {
            result.push({
              id: IdUtil.generate('erc'),
              severity: ErcSeverity.INFO,
              ruleType: ErcRuleType.PARAM_MISMATCH,
              message: `${comp.refDes}(${val}) 作为 LED 限流电阻过大，LED 可能不亮`,
              componentId: comp.id,
              fixSuggestion: 'LED 限流电阻建议 220Ω~1kΩ，推荐 R_330'
            });
          } else if (ohm > 0 && ohm < 100) {
            result.push({
              id: IdUtil.generate('erc'),
              severity: ErcSeverity.ERROR,
              ruleType: ErcRuleType.PARAM_MISMATCH,
              message: `${comp.refDes}(${val}) 作为 LED 限流电阻过小，LED 可能烧毁`,
              componentId: comp.id,
              fixSuggestion: 'LED 限流电阻不要小于 150Ω'
            });
          }
        }
      }
      const voltageParam = comp.parameters.get('voltage');
      if (comp.libraryId.startsWith('C_') && voltageParam !== undefined) {
        const v = parseInt(voltageParam);
        if (v < 16 && v > 0) {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.WARNING,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `${comp.refDes} 耐压 ${v}V 可能不足`,
            componentId: comp.id,
            fixSuggestion: '电源去耦电容建议 25V 以上耐压'
          });
        }
      }
    }
    return result;
  }

  private static checkIoRisks(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const leds = doc.components.filter(c => c.libraryId.includes('LED'));
    for (const led of leds) {
      if (FaultDiagnoser.ledHasSeriesResistor(doc, led.id)) {
        continue;
      }
      result.push({
        id: IdUtil.generate('erc'),
        severity: ErcSeverity.ERROR,
        ruleType: ErcRuleType.IO_OVERCURRENT,
        message: `LED ${led.refDes} 缺少限流电阻，可能烧毁`,
        componentId: led.id,
        fixSuggestion: '串联 220Ω~1kΩ 电阻（推荐 R_330）'
      });
    }
    return result;
  }

  /** VCC-GND 短路检测 */
  private static checkShortCircuits(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    for (const net of doc.nets) {
      const compIds = net.pinIds.map(pr => pr.split(':')[0]);
      const uniqueComps: string[] = [];
      for (const id of compIds) {
        if (!uniqueComps.includes(id)) {
          uniqueComps.push(id);
        }
      }
      const compLibIds = uniqueComps
        .map(id => doc.components.find(c => c.id === id)?.libraryId ?? '')
        .filter(id => id.length > 0);

      const hasVcc = compLibIds.some(id =>
        VCC_NAMES.has(id.toUpperCase()) || id === 'VCC');
      const hasGnd = compLibIds.some(id =>
        GND_NAMES.has(id.toUpperCase()) || id === 'GND');

      if (hasVcc && hasGnd) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `网络 "${net.name}" 同时包含 VCC 和 GND — 可能短路！`,
          netId: net.id,
          fixSuggestion: '检查是否误将 VCC 和 GND 连到同一网络'
        });
      }
    }
    return result;
  }

  // ---- L2: 严重警告 ----

  /** 浮空引脚检测 */
  private static checkFloatingPins(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const connectedPinRefs = new Set<string>();
    for (const net of doc.nets) {
      for (const pr of net.pinIds) {
        connectedPinRefs.add(pr);
      }
    }
    for (const comp of doc.components) {
      // 跳过电源/激励符号
      if (comp.libraryId === 'VCC' || comp.libraryId === 'GND' || comp.libraryId === 'VAC' ||
        comp.libraryId === 'VEE' || comp.libraryId === 'SIGNAL_GEN') {
        continue;
      }
      // MCU: 检查关键引脚
      if (MCU_IDS.has(comp.libraryId)) {
        let hasPower = false;
        for (const pr of connectedPinRefs) {
          if (pr.startsWith(comp.id)) {
            hasPower = true;
            break;
          }
        }
        if (!hasPower) {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.ERROR,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `MCU ${comp.refDes} 似乎无任何引脚连接`,
            componentId: comp.id,
            fixSuggestion: '至少需要连接 VCC、GND、RST、晶振'
          });
        }
      }
      // 运放: 反馈或有意开环比较器（双输入已接且 OUT 有负载/观测）
      if (comp.libraryId === 'LM358' || comp.libraryId === 'UA741' ||
        comp.libraryId === 'TL082' || comp.libraryId === 'TL072' ||
        comp.libraryId === 'LM324' || (comp.libraryId ?? '').toUpperCase().indexOf('OPAMP') >= 0) {
        const fb = FaultDiagnoser.classifyOpAmpFeedback(doc, comp.id);
        if (fb === 'open') {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.ERROR,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `运放 ${comp.refDes} 可能开环（无反馈路径）`,
            componentId: comp.id,
            fixSuggestion: '添加反馈：OUT→R→IN-（放大）或 OUT→R→IN+（迟滞比较）'
          });
        } else if (fb === 'comparator') {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.INFO,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `运放 ${comp.refDes} 为开环比较器（双输入已接，若非有意请加反馈）`,
            componentId: comp.id,
            fixSuggestion: '比较器可保持开环；放大器请加 OUT→IN- 反馈'
          });
        }
      }
      // 被动双端：完全未入网则报错（补全「仅 MCU/运放」漏检）
      const libUp = (comp.libraryId ?? '').toUpperCase();
      if (libUp.startsWith('R_') || libUp.startsWith('C_') || libUp.startsWith('L_') ||
        libUp.startsWith('LED_') || libUp.indexOf('DIODE') >= 0 || libUp.startsWith('POT_')) {
        let pinHits = 0;
        for (const pr of connectedPinRefs) {
          if (pr.startsWith(`${comp.id}:`)) {
            pinHits++;
          }
        }
        if (pinHits === 0) {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.ERROR,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `${comp.refDes} 完全未连接（无任何引脚入网）`,
            componentId: comp.id,
            fixSuggestion: '检查 net_plan / 导线端点是否触及器件脚'
          });
        }
      }
    }
    return result;
  }

  /** 电源完整性检查 */
  private static checkPowerIntegrity(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const mcus = doc.components.filter(c => MCU_IDS.has(c.libraryId));
    const caps = doc.components.filter(c => c.libraryId.startsWith('C_'));

    for (const mcu of mcus) {
      // 检查去耦电容数量
      const nearbyCaps = caps.filter(c => {
        const dx = Math.abs(c.position.x - mcu.position.x);
        const dy = Math.abs(c.position.y - mcu.position.y);
        return dx < 200 && dy < 200;
      });
      const neededMin = mcu.libraryId.startsWith('STM32') ? 3 : 1;
      if (nearbyCaps.length < neededMin) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.WARNING,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `MCU ${mcu.refDes} 去耦电容不足(${nearbyCaps.length}<${neededMin})`,
          componentId: mcu.id,
          fixSuggestion: `每个 VDD 引脚需配 1 个 C_100nF（共需≥${neededMin}）`
        });
      }
    }

    // 检查电源入口大电容
    const vccComp = doc.components.find(c => c.libraryId === 'VCC');
    if (vccComp !== undefined) {
      const hasBulkCap = caps.some(c => {
        const cVal = (c.libraryId ?? '').toUpperCase();
        return (cVal.includes('10U') || cVal.includes('100U')) &&
          Math.abs(c.position.x - vccComp.position.x) < 300;
      });
      if (!hasBulkCap) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.WARNING,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: '电源入口缺少电解大电容(≥10uF)',
          componentId: vccComp.id,
          fixSuggestion: 'VCC 入口并联 C_10uF 或 C_100uF'
        });
      }
    }

    return result;
  }

  /** 扇出过载检测 — 仅提示，避免把电源聚合网 / 多标号网误判为 GPIO 过载 */
  private static checkFanout(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    for (const net of doc.nets) {
      if (FaultDiagnoser.netLooksLikePowerRail(doc, net)) {
        continue;
      }
      const loadCount = net.pinIds.length;
      if (loadCount > 10) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.INFO,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `网络 "${net.name}" 连接 ${loadCount} 个引脚，可能存在扇出过载`,
          netId: net.id,
          fixSuggestion: '使用缓冲器(74HC04)或减少负载数'
        });
      }
    }
    return result;
  }

  // ---- L2.5: 仪器拓扑校验 ----

  /**
   * 仪器拓扑校验 — 防止电流表并联、电压表同节点等接线错误
   *
   * 核心检测:
   *  1. 电流表必须在串联支路中: VCC→I+→I-→负载, 而非 I+→VCC, I-→负载 (并联)
   *  2. 多块电压表不应全部测量同一节点对
   *  3. 电流路径不得绕过测量仪器
   */
  private static checkInstrumentTopology(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const ammeters = doc.components.filter(c => c.libraryId === 'AMMETER_DC');
    const voltmeters = doc.components.filter(c =>
      c.libraryId === 'VOLTMETER_DC' || c.libraryId === 'VIRTUAL_METER');

    // ---- 电流表串联校验 ----
    for (const am of ammeters) {
      const iPlusNet = doc.nets.find(n => n.pinIds.some(p => p.startsWith(am.id) && p.includes('I+')));
      const iMinusNet = doc.nets.find(n => n.pinIds.some(p => p.startsWith(am.id) && p.includes('I-')));

      if (iPlusNet === undefined || iMinusNet === undefined) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.UNCONNECTED_PIN,
          message: `电流表 ${am.refDes} 引脚未完全连接`,
          componentId: am.id,
          fixSuggestion: '电流表须串联切入回路：I+ / I- 分属不同网络'
        });
        continue;
      }

      if (iPlusNet.id === iMinusNet.id) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `电流表 ${am.refDes} I+/I- 在同一网络 — 短路！应为串联`,
          componentId: am.id,
          fixSuggestion: '电流表必须串联: 电源→I+→I-→负载, I+/I- 分属不同网络'
        });
        continue;
      }

      // 两侧网须有其它器件；不强制 I+ 必须挂 VCC（回线测流 / 支路测流合法）
      const plusOthers = FaultDiagnoser.netComponentIds(iPlusNet, doc)
        .filter(id => id !== am.id);
      const minusOthers = FaultDiagnoser.netComponentIds(iMinusNet, doc)
        .filter(id => id !== am.id);
      if (plusOthers.length === 0 || minusOthers.length === 0) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `电流表 ${am.refDes} 一侧网络无其它器件 — 未真正串联切入回路`,
          componentId: am.id,
          fixSuggestion: '将电流表串入电源→负载完整回路'
        });
        continue;
      }
      const plusHasSrc = FaultDiagnoser.netHasPowerSource(doc, iPlusNet) ||
        FaultDiagnoser.netHasPowerSource(doc, iMinusNet);
      const hasLoad = FaultDiagnoser.netHasCurrentLoad(doc, iPlusNet) ||
        FaultDiagnoser.netHasCurrentLoad(doc, iMinusNet);
      if (!plusHasSrc && !hasLoad) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.INFO,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `电流表 ${am.refDes} 两侧未见电源或负载 — 请确认已串入供电回路`,
          componentId: am.id,
          fixSuggestion: '常见接法: VCC→I+→I-→R/LED→GND，或负载回线测流'
        });
      }
    }

    // ---- 示波器拓扑 ----
    const scopes = doc.components.filter(c =>
      (c.libraryId ?? '').toUpperCase().indexOf('OSCILLOSCOPE') >= 0);
    for (const sc of scopes) {
      const findPinNet = (pinHint: string): string | undefined => {
        const h = pinHint.toUpperCase();
        const n = doc.nets.find(net => net.pinIds.some(p => {
          const parts = p.split(':');
          if (parts[0] !== sc.id) {
            return false;
          }
          const pin = (parts[1] ?? '').toUpperCase();
          return pin === h || pin.indexOf(h) === 0;
        }));
        return n?.id;
      };
      const ch1 = findPinNet('CH1') ?? findPinNet('1');
      const gnd = findPinNet('GND') ?? findPinNet('5');
      if (ch1 === undefined) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.UNCONNECTED_PIN,
          message: `示波器 ${sc.refDes} CH1 未连接 — 无法观测波形`,
          componentId: sc.id,
          fixSuggestion: '将 CH1 接到被测信号节点（如 RC 中点），GND 接系统地'
        });
      }
      if (gnd === undefined) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.UNCONNECTED_PIN,
          message: `示波器 ${sc.refDes} GND 未连接 — 必须与电路共地`,
          componentId: sc.id,
          fixSuggestion: '将示波器 GND 接到 GND 网络'
        });
      }
      if (ch1 !== undefined && gnd !== undefined && ch1 === gnd) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.PARAM_MISMATCH,
          message: `示波器 ${sc.refDes} CH1 与 GND 同网 — 无有效差分信号`,
          componentId: sc.id,
          fixSuggestion: 'CH1 接信号节点，GND 接系统地，二者不得同网'
        });
      }
      // CH* 挂电源轨：测纹波合法，降为 INFO 避免误阻生图
      const senseHints = ['CH1', 'CH2', 'CH3', 'CH4'];
      for (let hi = 0; hi < senseHints.length; hi++) {
        const sid = findPinNet(senseHints[hi]);
        if (sid === undefined) {
          continue;
        }
        const net = doc.nets.find(n => n.id === sid);
        if (net !== undefined && FaultDiagnoser.netLooksLikePowerRail(doc, net)) {
          const nName = (net.name ?? '').toUpperCase();
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.INFO,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `示波器 ${sc.refDes}.${senseHints[hi]} 挂在电源网 ${nName} — 恒压无观测意义（测纹波可忽略）`,
            componentId: sc.id,
            fixSuggestion: '一般将通道接到被测信号节点；测电源纹波时可保留'
          });
        }
      }
    }

    // ---- 电压表同节点检测 ----
    if (voltmeters.length >= 2) {
      const vmNodePairs: string[] = [];
      for (const vm of voltmeters) {
        const vPlusNet = doc.nets.find(n =>
          n.pinIds.some(p => p.startsWith(vm.id) && (p.includes('V+') || p.includes('V'))));
        const comNet = doc.nets.find(n =>
          n.pinIds.some(p => p.startsWith(vm.id) && p.includes('COM')));
        if (vPlusNet !== undefined && comNet !== undefined) {
          vmNodePairs.push(`${vPlusNet.id}:${comNet.id}`);
        }
      }

      // 检测是否所有电压表测量同一节点对
      if (vmNodePairs.length >= 2) {
        const firstPair = vmNodePairs[0];
        let allSame = true;
        for (let i = 1; i < vmNodePairs.length; i++) {
          if (vmNodePairs[i] !== firstPair) {
            allSame = false;
            break;
          }
        }
        if (allSame && vmNodePairs[0].length > 0) {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.INFO,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: `${voltmeters.length} 块电压表全部测量同一节点对 — 应分布在分压链不同节点`,
            fixSuggestion: '电压表应分别测量不同电阻的压降 (VCC↔SENSE 和 SENSE↔GND)'
          });
        }
      }
    }

    // ---- 电流路径完整性 ----
    // 检测: VCC 是否直接连到地 (绕过所有负载)
    const vccNets = doc.nets.filter(n => (n.name ?? '').toUpperCase() === 'VCC');
    const gndNets = doc.nets.filter(n => (n.name ?? '').toUpperCase() === 'GND' || n.name === 'GND');
    for (const vn of vccNets) {
      for (const gn of gndNets) {
        if (vn.id === gn.id) {
          continue; // 同一网络即短路，由 checkShortCircuits 处理
        }
        const vnComps = FaultDiagnoser.netComponentIds(vn, doc);
        const gnComps = FaultDiagnoser.netComponentIds(gn, doc);
        // VCC 和 GND 网络共享同一电阻 → 该电阻跨接 VCC-GND (正常)
        // VCC 网络无电阻直接连到 GND 网络的器件 → 异常
        const hasResistorBetween = vnComps.some(id => {
          const c = doc.components.find(x => x.id === id);
          return c !== undefined && c.libraryId.startsWith('R_');
        });
        const gnHasLoad = gnComps.some(id => {
          const c = doc.components.find(x => x.id === id);
          return c !== undefined && (c.libraryId.startsWith('R_') || c.libraryId.startsWith('LED_'));
        });
        if (!hasResistorBetween && !gnHasLoad && vnComps.length > 0) {
          result.push({
            id: IdUtil.generate('erc'),
            severity: ErcSeverity.INFO,
            ruleType: ErcRuleType.PARAM_MISMATCH,
            message: 'VCC 与 GND 之间无负载电阻 — 可能存在电流直通路径',
            fixSuggestion: '确保 VCC 与 GND 之间有分压电阻或负载'
          });
        }
      }
    }

    return result;
  }

  /** 提取网络中所有器件 ID */
  private static netComponentIds(net: Net, doc: SchematicDocument): string[] {
    const ids: string[] = [];
    for (const pr of net.pinIds) {
      const compId = pr.split(':')[0];
      if (ids.indexOf(compId) < 0) {
        ids.push(compId);
      }
    }
    return ids;
  }

  // ---- L2.6: 命名违规 + 全浮空器件 + GPIO直连电源 ----

  /** 信号网络使用保留电源名 → 致命错误（真电源轨误标 SIGNAL 则豁免） */
  private static checkPowerNameAbuse(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const reserved = new Set(['VCC', 'VDD', 'GND', 'VSS', 'VEE', '3V3', '3.3V', '5V', '12V']);
    for (const net of doc.nets) {
      const upper = (net.name ?? '').toUpperCase();
      if (!reserved.has(upper)) {
        continue;
      }
      if (net.type === NetType.POWER || net.type === NetType.GROUND) {
        continue;
      }
      // 网上已有对应电源符号 → 仅 type 标错，不误报
      if (FaultDiagnoser.netLooksLikePowerRail(doc, net)) {
        continue;
      }
      result.push({
        id: IdUtil.generate('erc'),
        severity: ErcSeverity.ERROR,
        ruleType: ErcRuleType.PARAM_MISMATCH,
        message: `信号网络 "${net.name}" 使用了保留电源名 — 将导致仿真 Netlist 错误合并`,
        netId: net.id,
        fixSuggestion: `将网络名改为 "${net.name}_SIG" 或其他描述性名称`
      });
    }
    return result;
  }

  /** 器件完全无连接 → 致命错误（仪器/激励符号豁免） */
  private static checkFullyFloatingComponent(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const skipIds = new Set([
      'VCC', 'GND', 'VAC', 'VEE', 'SIGNAL_GEN',
      'OSCILLOSCOPE', 'LOGIC_ANALYZER', 'FREQ_COUNTER', 'POWER_METER',
      'VOLTMETER_DC', 'AMMETER_DC', 'VIRTUAL_METER', 'UART_TERMINAL',
      'LCD1602', 'OLED_12864'
    ]);
    for (const comp of doc.components) {
      const libU = (comp.libraryId ?? '').toUpperCase();
      if (skipIds.has(comp.libraryId) || skipIds.has(libU) ||
        libU.indexOf('OSCILLOSCOPE') >= 0 || libU.indexOf('METER') >= 0) {
        continue;
      }
      let connected = false;
      for (const net of doc.nets) {
        for (const pr of net.pinIds) {
          if (pr.startsWith(comp.id)) {
            connected = true;
            break;
          }
        }
        if (connected) {
          break;
        }
      }
      if (!connected) {
        result.push({
          id: IdUtil.generate('erc'),
          severity: ErcSeverity.ERROR,
          ruleType: ErcRuleType.UNCONNECTED_PIN,
          message: `器件 ${comp.refDes}(${comp.libraryId}) 完全未连接 — 无效器件`,
          componentId: comp.id,
          fixSuggestion: '连接该器件到电路或从设计中移除'
        });
      }
    }
    return result;
  }

  /** GPIO 直连 VCC/GND 检测 — 推挽输出接电源可能导致短路 */
  private static checkGpioDirectPower(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    const mcus = doc.components.filter(c => MCU_IDS.has(c.libraryId));
    if (mcus.length === 0) {
      return result;
    }

    for (const mcu of mcus) {
      const mcuNets = doc.nets.filter(n => n.pinIds.some(p => p.startsWith(mcu.id)));
      for (const net of mcuNets) {
        const isPowerNet = VCC_NAMES.has((net.name ?? '').toUpperCase()) ||
          GND_NAMES.has((net.name ?? '').toUpperCase());
        if (!isPowerNet) {
          continue;
        }
        // 找出该网络中 MCU 的引脚
        const mcuPins = net.pinIds.filter(p => p.startsWith(mcu.id));
        for (const pr of mcuPins) {
          const pinId = pr.split(':')[1] ?? '';
          // 跳过明显的电源引脚
          const upperPin = pinId.toUpperCase();
          if (upperPin.includes('VDD') || upperPin.includes('VCC') ||
            upperPin.includes('VSS') || upperPin.includes('GND') ||
            upperPin.includes('AVDD') || upperPin.includes('AVSS') ||
            upperPin.includes('XTAL') || upperPin.includes('OSC') ||
            upperPin.includes('PH0') || upperPin.includes('PH1') ||
            upperPin === 'EA' || upperPin === 'BOOT0' || upperPin === 'BOOT1' ||
            upperPin === 'RST' || upperPin === 'NRST' || upperPin === 'RESET') {
            continue;
          }
          // 检测 GPIO/IO 引脚连接到电源
          if (upperPin.startsWith('P') || upperPin.startsWith('PA') ||
            upperPin.startsWith('PB') || upperPin.startsWith('PC') ||
            upperPin.startsWith('PD') || upperPin.startsWith('PE') ||
            upperPin.includes('GPIO')) {
            result.push({
              id: IdUtil.generate('erc'),
              severity: ErcSeverity.ERROR,
              ruleType: ErcRuleType.IO_OVERCURRENT,
              message: `MCU ${mcu.refDes} 引脚 ${pinId} 直连电源 "${net.name}" — GPIO可能烧毁`,
              componentId: mcu.id,
              fixSuggestion: 'GPIO 通过限流电阻(≥330Ω)连接，或配置为开漏模式'
            });
          }
        }
      }
    }
    return result;
  }

  // ---- L3: 建议 ----

  private static checkCapVoltage(doc: SchematicDocument): ErcViolation[] {
    const result: ErcViolation[] = [];
    for (const comp of doc.components) {
      if (comp.libraryId.startsWith('C_')) {
        const voltageStr = comp.parameters.get('voltage');
        if (voltageStr !== undefined) {
          const v = parseInt(voltageStr);
          // 电源去耦需要至少 2x 余量
          const isDecoupling = doc.components.some(c =>
            MCU_IDS.has(c.libraryId) &&
            Math.abs(c.position.x - comp.position.x) < 100);
          if (isDecoupling && v > 0 && v < 10) {
            result.push({
              id: IdUtil.generate('erc'),
              severity: ErcSeverity.INFO,
              ruleType: ErcRuleType.PARAM_MISMATCH,
              message: `${comp.refDes} 耐压 ${v}V 作为去耦电容余量不足`,
              componentId: comp.id,
              fixSuggestion: '推荐 25V 以上耐压'
            });
          }
        }
      }
    }
    return result;
  }

  /**
   * 运放反馈分类：
   * - closed: 负/正反馈（同网或经 R/C）
   * - comparator: 双输入已接且 OUT 已接、无反馈 → 有意开环比较器
   * - open: 真开环（缺输入或 OUT 悬空等）
   */
  private static classifyOpAmpFeedback(doc: SchematicDocument, opAmpId: string):
    'closed' | 'comparator' | 'open' {
    if (FaultDiagnoser.opAmpHasFeedbackPath(doc, opAmpId)) {
      return 'closed';
    }
    const channels: string[] = ['', '1', '2'];
    let sawChannel = false;
    for (let ci = 0; ci < channels.length; ci++) {
      const suf = channels[ci];
      const outNet = FaultDiagnoser.findPinNetId(doc, opAmpId, `OUT${suf}`);
      const innNet = FaultDiagnoser.findPinNetId(doc, opAmpId, `IN-${suf}`);
      const inpNet = FaultDiagnoser.findPinNetId(doc, opAmpId, `IN+${suf}`);
      if (outNet.length === 0 && innNet.length === 0 && inpNet.length === 0) {
        continue;
      }
      sawChannel = true;
      if (outNet.length > 0 && innNet.length > 0 && inpNet.length > 0 &&
        innNet !== inpNet) {
        return 'comparator';
      }
    }
    return sawChannel ? 'open' : 'open';
  }

  /**
   * 运放是否有反馈路径：
   * - OUT 与 IN- 或 IN+ 同网（跟随 / 迟滞直接反馈）
   * - 经 R_* / C_* 桥接 OUT 网与任一输入网（反相放大 / 迟滞比较器）
   */
  private static opAmpHasFeedbackPath(doc: SchematicDocument, opAmpId: string): boolean {
    const channels: string[] = ['', '1', '2'];
    let anyChannelPresent = false;
    for (let ci = 0; ci < channels.length; ci++) {
      const suf = channels[ci];
      const outNet = FaultDiagnoser.findPinNetId(doc, opAmpId, `OUT${suf}`);
      const innNet = FaultDiagnoser.findPinNetId(doc, opAmpId, `IN-${suf}`);
      const inpNet = FaultDiagnoser.findPinNetId(doc, opAmpId, `IN+${suf}`);
      if (outNet.length === 0 && innNet.length === 0 && inpNet.length === 0) {
        continue;
      }
      anyChannelPresent = true;
      if (outNet.length === 0) {
        continue;
      }
      if ((innNet.length > 0 && outNet === innNet) ||
        (inpNet.length > 0 && outNet === inpNet)) {
        return true;
      }
      if (FaultDiagnoser.passiveBridgesNets(doc, outNet, innNet) ||
        FaultDiagnoser.passiveBridgesNets(doc, outNet, inpNet)) {
        return true;
      }
    }
    // 无任何通道有脚入网时，不得视为「已有反馈」（否则浮空运报 closed）
    return false;
  }

  private static findPinNetId(doc: SchematicDocument, compId: string, pinLabel: string): string {
    const want = pinLabel.toUpperCase();
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const net = doc.nets[ni];
      for (let pi = 0; pi < net.pinIds.length; pi++) {
        const pr = parsePinRef(net.pinIds[pi]);
        if (pr === null || pr.compId !== compId) {
          continue;
        }
        const name = (pr.pinName || pr.pinId).toUpperCase();
        const id = (pr.pinId || '').toUpperCase();
        if (name === want || id === want) {
          return net.id;
        }
      }
    }
    return '';
  }

  /** R_/C_ 两脚是否分别落在 netA 与 netB */
  private static passiveBridgesNets(doc: SchematicDocument, netA: string, netB: string): boolean {
    if (netA.length === 0 || netB.length === 0 || netA === netB) {
      return false;
    }
    for (let ci = 0; ci < doc.components.length; ci++) {
      const c = doc.components[ci];
      const lib = (c.libraryId ?? '').toUpperCase();
      if (!lib.startsWith('R_') && !lib.startsWith('C_')) {
        continue;
      }
      const netsOnComp = FaultDiagnoser.componentNetIds(doc, c.id);
      if (netsOnComp.indexOf(netA) >= 0 && netsOnComp.indexOf(netB) >= 0) {
        return true;
      }
    }
    return false;
  }

  private static componentNetIds(doc: SchematicDocument, compId: string): string[] {
    const netsOnComp: string[] = [];
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const net = doc.nets[ni];
      for (let pi = 0; pi < net.pinIds.length; pi++) {
        const pr = parsePinRef(net.pinIds[pi]);
        if (pr !== null && pr.compId === compId && netsOnComp.indexOf(net.id) < 0) {
          netsOnComp.push(net.id);
        }
      }
    }
    return netsOnComp;
  }

  private static parseOhmRough(val: string): number {
    const s = (val ?? '').trim().replace(/\s+/g, '');
    if (s.length === 0) {
      return 0;
    }
    const m = s.match(/^([\d.]+)\s*([kKmMgG]?)/);
    if (m === null) {
      const digits = s.replace(/[^0-9.]/g, '');
      return parseFloat(digits) || 0;
    }
    let n = parseFloat(m[1]);
    if (!Number.isFinite(n)) {
      return 0;
    }
    const u = (m[2] ?? '').toLowerCase();
    if (u === 'k') {
      n *= 1e3;
    } else if (u === 'm') {
      n *= 1e6;
    } else if (u === 'g') {
      n *= 1e9;
    }
    return n;
  }

  /** LED 是否与某电阻共网（串联限流） */
  private static ledHasSeriesResistor(doc: SchematicDocument, ledId: string): boolean {
    for (let ni = 0; ni < doc.nets.length; ni++) {
      const net = doc.nets[ni];
      let hasLed = false;
      let hasR = false;
      for (let pi = 0; pi < net.pinIds.length; pi++) {
        const pr = parsePinRef(net.pinIds[pi]);
        if (pr === null) {
          continue;
        }
        if (pr.compId === ledId) {
          hasLed = true;
        }
        const c = doc.components.find(x => x.id === pr.compId);
        if (c !== undefined && (c.libraryId ?? '').startsWith('R_')) {
          hasR = true;
        }
      }
      if (hasLed && hasR) {
        return true;
      }
    }
    return false;
  }

  /** 该电阻是否作为 LED 串联限流（共网 + 另一端接电源/地/驱动） */
  private static ledsLikelyLimitedByResistor(doc: SchematicDocument,
    rComp: ComponentInstance): string[] {
    const rNets = FaultDiagnoser.componentNetIds(doc, rComp.id);
    if (rNets.length < 2) {
      return [];
    }
    const ledIds: string[] = [];
    for (let i = 0; i < rNets.length; i++) {
      const net = doc.nets.find(n => n.id === rNets[i]);
      if (net === undefined) {
        continue;
      }
      for (let pi = 0; pi < net.pinIds.length; pi++) {
        const pr = parsePinRef(net.pinIds[pi]);
        if (pr === null || pr.compId === rComp.id) {
          continue;
        }
        const c = doc.components.find(x => x.id === pr.compId);
        if (c === undefined || !(c.libraryId ?? '').includes('LED')) {
          continue;
        }
        // 电阻另一网须像电源/地/开关/MCU，才视为限流而非反馈旁路
        let otherIsDrive = false;
        for (let j = 0; j < rNets.length; j++) {
          if (j === i) {
            continue;
          }
          const other = doc.nets.find(n => n.id === rNets[j]);
          if (other !== undefined &&
            (FaultDiagnoser.netLooksLikePowerRail(doc, other) ||
              FaultDiagnoser.netHasDriver(doc, other))) {
            otherIsDrive = true;
          }
        }
        if (otherIsDrive && ledIds.indexOf(c.id) < 0) {
          ledIds.push(c.id);
        }
      }
    }
    return ledIds;
  }

  private static netLooksLikePowerRail(doc: SchematicDocument, net: Net): boolean {
    const upper = (net.name ?? '').toUpperCase();
    if (VCC_NAMES.has(upper) || GND_NAMES.has(upper) || upper === 'VEE' ||
      upper === '-12V' || upper === '-5V') {
      return true;
    }
    if (net.type === NetType.POWER || net.type === NetType.GROUND) {
      return true;
    }
    const ids = FaultDiagnoser.netComponentIds(net, doc);
    for (let i = 0; i < ids.length; i++) {
      const c = doc.components.find(x => x.id === ids[i]);
      if (c === undefined) {
        continue;
      }
      const lib = (c.libraryId ?? '').toUpperCase();
      if (lib === 'VCC' || lib === 'GND' || lib === 'VEE' ||
        VCC_NAMES.has(lib) || GND_NAMES.has(lib) ||
        lib.startsWith('LM78') || lib.startsWith('AMS')) {
        return true;
      }
    }
    return false;
  }

  private static netHasPowerSource(doc: SchematicDocument, net: Net): boolean {
    const ids = FaultDiagnoser.netComponentIds(net, doc);
    for (let i = 0; i < ids.length; i++) {
      const c = doc.components.find(x => x.id === ids[i]);
      if (c === undefined) {
        continue;
      }
      const lib = (c.libraryId ?? '').toUpperCase();
      if (lib === 'VCC' || lib === 'VEE' || lib === 'VAC' || lib === 'SIGNAL_GEN' ||
        VCC_NAMES.has(lib) || lib.startsWith('LM78') || lib.startsWith('AMS')) {
        return true;
      }
    }
    return FaultDiagnoser.netLooksLikePowerRail(doc, net);
  }

  private static netHasCurrentLoad(doc: SchematicDocument, net: Net): boolean {
    const ids = FaultDiagnoser.netComponentIds(net, doc);
    for (let i = 0; i < ids.length; i++) {
      const c = doc.components.find(x => x.id === ids[i]);
      if (c === undefined) {
        continue;
      }
      const lib = (c.libraryId ?? '').toUpperCase();
      if (lib.startsWith('R_') || lib.startsWith('LED') || lib.startsWith('L_') ||
        lib.indexOf('BUZZER') >= 0 || lib.indexOf('RELAY') >= 0 ||
        lib.indexOf('NPN') >= 0 || lib.indexOf('PNP') >= 0 ||
        lib.indexOf('NMOS') >= 0 || lib.indexOf('PMOS') >= 0 ||
        MCU_IDS.has(c.libraryId)) {
        return true;
      }
    }
    return false;
  }

  private static netHasDriver(doc: SchematicDocument, net: Net): boolean {
    if (FaultDiagnoser.netHasPowerSource(doc, net)) {
      return true;
    }
    const ids = FaultDiagnoser.netComponentIds(net, doc);
    for (let i = 0; i < ids.length; i++) {
      const c = doc.components.find(x => x.id === ids[i]);
      if (c === undefined) {
        continue;
      }
      const lib = (c.libraryId ?? '').toUpperCase();
      if (lib === 'SW_PUSH' || lib.indexOf('RELAY') >= 0 || MCU_IDS.has(c.libraryId) ||
        lib.indexOf('74HC') >= 0 || lib.indexOf('GATE_') >= 0) {
        return true;
      }
    }
    return false;
  }
}

