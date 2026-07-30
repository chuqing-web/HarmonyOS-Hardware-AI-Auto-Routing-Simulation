/**
 * PCB 实验模板注册表 — 与原理图 LabTemplateRegistry 一一对应
 */
export interface PcbLabTemplateDef {
  id: string;
  name: string;
  category: string;
  description: string;
  /** PCB 侧知识点：层栈 / DRC / 布线 / 铺铜 */
  knowledgePoints: string[];
  /** Test_Template 下文件名 */
  pcbFile: string;
}

export class PcbLabTemplateRegistry {
  private static extraTemplates: PcbLabTemplateDef[] = [];

  private static readonly COMMON_PCB_TIPS: string[] = [
    '双面板：信号优先 F.Cu，GND 铺铜在 B.Cu',
    '插入后检查 DRC：间距 / 未布线网络 / 出板',
    '电源/地靠铺铜与宽线，信号用自动 L 型走线对照'
  ];

  private static def(id: string, name: string, category: string, description: string,
    extraTips: string[]): PcbLabTemplateDef {
    return {
      id,
      name: `${name}（PCB）`,
      category,
      description,
      knowledgePoints: PcbLabTemplateRegistry.COMMON_PCB_TIPS.concat(extraTips),
      pcbFile: `${id}.pcbsim`
    };
  }

  private static readonly BUILTIN: PcbLabTemplateDef[] = [
    PcbLabTemplateRegistry.def('lab_power', '直流电源电路', 'power',
      '稳压电源成品板：稳压器封装 + 滤波 + GND 铺铜',
      ['TO-220 稳压器散热与 GND 铺铜连接', '输入/输出电容靠近稳压器摆放']),
    PcbLabTemplateRegistry.def('lab_amp', '运算放大电路', 'analog',
      '运放放大器成品板：SOIC 运放 + 反馈电阻网络',
      ['运放去耦电容靠近电源脚', '反馈网络短走线降低噪声']),
    PcbLabTemplateRegistry.def('lab_filter', 'RC滤波电路', 'analog',
      'RC 低通 + 缓冲成品板',
      ['RC 节点走线尽量短', '对照 DRC 查看未布线网络']),
    PcbLabTemplateRegistry.def('lab_51_led', '51流水灯', 'mcu',
      '8051 流水灯成品板：MCU + 晶振 + LED',
      ['晶振走线短且对称', 'LED 限流电阻与 IO 同网核对']),
    PcbLabTemplateRegistry.def('lab_uart', '串口通信', 'mcu',
      'STM32 UART 成品板',
      ['UART TX/RX 交叉与丝印核对', '晶振/复位靠近 MCU']),
    PcbLabTemplateRegistry.def('lab_passive', '无源器件检测', 'passive',
      '无源器件阵列成品板',
      ['同类封装成行摆放便于对照', 'GND 铺铜覆盖板框内侧']),
    PcbLabTemplateRegistry.def('lab_discrete', '分立器件检测', 'discrete',
      '二极管/三极管/MOS 成品板',
      ['SOT-23 极性与丝印', '功率器件散热与铺铜']),
    PcbLabTemplateRegistry.def('lab_analog_ic', '模拟IC检测', 'analog',
      '运放/555/稳压 IC 成品板',
      ['IC 电源脚就近去耦', '多层网络用飞线/DRC 检查']),
    PcbLabTemplateRegistry.def('lab_digital', '数字逻辑检测', 'digital',
      '74HC 逻辑成品板',
      ['时钟线优先短直', '避免与模拟区交叉（本板单区对照）']),
    PcbLabTemplateRegistry.def('lab_memory', '存储器接口', 'memory',
      '存储器接口成品板',
      ['总线等长仅作概念对照', 'CS/SCK 等关键信号优先布通']),
    PcbLabTemplateRegistry.def('lab_mcu_8051', '8051全系列', 'mcu',
      '多颗 8051 最小系统成品板',
      ['多 MCU 分区摆放', '公共 GND 铺铜连接']),
    PcbLabTemplateRegistry.def('lab_mcu_stm32', 'STM32全系列', 'mcu',
      '多颗 STM32 最小系统成品板',
      ['HSE 晶振靠近芯片', '对照层栈为双面板']),
    PcbLabTemplateRegistry.def('lab_peripheral', '外设接口实验', 'peripheral',
      '按键/显示/继电器成品板',
      ['人机接口器件靠板边', '继电器触点网络勿与 MCU 电源短路']),
    PcbLabTemplateRegistry.def('lab_sensor', '传感器实验', 'sensor',
      '传感器接口成品板',
      ['模拟传感走线远离数字时钟', '1-Wire/ADC 网络 DRC 核对']),
    PcbLabTemplateRegistry.def('lab_instruments', '仪器仪表检测', 'instrument',
      '仪器类器件多跳过布局；板内仅可布局器件对照',
      ['虚拟仪器无封装属预期', '可布局部分仍做走线/铺铜演示']),
    PcbLabTemplateRegistry.def('lab_digital_gates', '数字门电路实验', 'digital',
      '门电路真值表成品板',
      ['LED 限流电阻与门输出同网', '时钟网络优先布通']),
    PcbLabTemplateRegistry.def('lab_schmitt', '运放滞回比较器整形', 'analog',
      '滞回比较器成品板',
      ['正反馈电阻靠近运放', '双电源走线对称']),
    PcbLabTemplateRegistry.def('lab_integrator', 'RC积分电路', 'analog',
      '积分电路成品板',
      ['积分电容靠近运放反相端', '对照自动布线 L 型折线']),
    PcbLabTemplateRegistry.def('lab_555_astable', '555多谐振荡器', 'analog',
      '555 无稳态成品板',
      ['定时 RC 靠近 555', 'OUT→LED 限流网络核对']),
    PcbLabTemplateRegistry.def('lab_555_monostable', '555单稳态延时', 'analog',
      '555 单稳态成品板',
      ['TRIG 按键走线短', '定时电容与 DISCH/THRES 同网'])
  ];

  static listTemplates(): PcbLabTemplateDef[] {
    return PcbLabTemplateRegistry.BUILTIN.concat(PcbLabTemplateRegistry.extraTemplates);
  }

  static findById(id: string): PcbLabTemplateDef | undefined {
    return PcbLabTemplateRegistry.listTemplates().find(t => t.id === id);
  }

  static registerTemplate(def: PcbLabTemplateDef): void {
    const idx = PcbLabTemplateRegistry.extraTemplates.findIndex(t => t.id === def.id);
    if (idx >= 0) {
      PcbLabTemplateRegistry.extraTemplates[idx] = def;
    } else {
      PcbLabTemplateRegistry.extraTemplates.push(def);
    }
  }

  static listCategories(): string[] {
    const cats = new Set<string>();
    for (const t of PcbLabTemplateRegistry.listTemplates()) {
      cats.add(t.category);
    }
    return Array.from(cats);
  }

  static listByCategory(category: string): PcbLabTemplateDef[] {
    if (category === 'all') {
      return PcbLabTemplateRegistry.listTemplates();
    }
    return PcbLabTemplateRegistry.listTemplates().filter(t => t.category === category);
  }
}
