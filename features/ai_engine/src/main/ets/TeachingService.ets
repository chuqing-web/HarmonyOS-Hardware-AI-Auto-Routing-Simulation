/**
 * 教学辅助 + 实验模板 + AI 答疑
 */
import {
  SchTopology, ApiResult, ResultHelper, ErrCode, TopologyAdapter
} from 'common';
import { CircuitTemplates } from './algorithms/CircuitTemplates';
import { cloneLabTemplateArray } from './internal/AiEngineHelpers';

/** 模板关联的固件信息 */
export interface TemplateFirmware {
  hexText: string;
  mcuFamily: string; // '8051' | 'STM32'
}

export interface LabTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  knowledgePoints: string[];
}

export interface KnowledgeTip {
  componentType: string;
  title: string;
  content: string;
}

export class TeachingService {
  private static templates: LabTemplate[] = [
    { id: 'lab_power', name: '直流电源电路', category: 'power', description: 'LM7805 稳压电源', knowledgePoints: ['稳压原理', '滤波电容'] },
    { id: 'lab_amp', name: '运算放大电路', category: 'analog', description: '同相/反相放大器', knowledgePoints: ['虚短虚断', '增益计算'] },
    { id: 'lab_filter', name: 'RC滤波电路', category: 'analog', description: '低通/高通滤波', knowledgePoints: ['截止频率', '波特图'] },
    { id: 'lab_51_led', name: '51流水灯', category: 'mcu', description: 'STC89 流水灯实验', knowledgePoints: ['IO口', '定时器'] },
    { id: 'lab_uart', name: '串口通信', category: 'mcu', description: 'STM32 UART 实验', knowledgePoints: ['波特率', '帧格式'] },
  ];

  private static tips: KnowledgeTip[] = [
    { componentType: 'UA741', title: '运算放大器', content: '虚短：同相端与反相端电压相等；虚断：输入电流为零' },
    { componentType: 'AT89C51', title: '51单片机', content: '4组IO口(P0~P3)，P0需外部上拉，16位寻址空间64KB' },
    { componentType: 'STM32F103', title: 'STM32', content: 'Cortex-M3内核，72MHz，丰富外设：GPIO/ADC/UART/SPI/I2C/TIM' },
  ];

  /** 模板固件数据 (Intel HEX 格式) */
  private static readonly FW_51: TemplateFirmware = {
    mcuFamily: '8051',
    hexText:
      ':0300000002000100FA\n' +
      ':1201000074FEF59012010B2380F878FF79FFD9FED8FA2283\n' +
      ':00000001FF\n'
  };
  private static readonly FW_STM32: TemplateFirmware = {
    mcuFamily: 'STM32',
    hexText:
      ':40000000001000200101000841000008410000084100000841000008410000080000000000000000000000000000000041000008410000080000000041000008410000083E\n' +
      ':02004000FEE7D9\n' +
      ':4401000009480A4901600A480A4901600A480B4981600B498161017820221142FBD001790171F8E7000000001810024004400000000080140004B0000003801404C1D00000C200000FF\n' +
      ':00000001FF\n'
  };

  private static getFirmwareById(id: string): TemplateFirmware | null {
    if (id === 'lab_51_led') return TeachingService.FW_51;
    if (id === 'lab_uart') return TeachingService.FW_STM32;
    return null;
  }

  listTemplates(): LabTemplate[] {
    return cloneLabTemplateArray(TeachingService.templates);
  }

  loadTemplate(templateId: string): ApiResult<SchTopology> {
    const tpl = TeachingService.templates.find(t => t.id === templateId);
    if (!tpl) return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'Template not found');
    const doc = CircuitTemplates.generate(tpl.description);
    doc.name = tpl.name;
    return ResultHelper.ok(TopologyAdapter.toTopology(doc));
  }

  /** 获取模板关联的固件 (有 MCU 的模板才返回) */
  getTemplateFirmware(templateId: string): TemplateFirmware | null {
    return TeachingService.getFirmwareById(templateId);
  }

  getKnowledgeTip(libraryId: string): KnowledgeTip | null {
    for (const tip of TeachingService.tips) {
      if (libraryId.includes(tip.componentType)) return tip;
    }
    return null;
  }

  stepPowerOnSequence(topo: SchTopology, stepIndex: number): SchTopology {
    const result = JSON.parse(JSON.stringify(topo)) as SchTopology;
    const powerNets = result.netList.filter(n => n.isPower);
    for (let i = 0; i <= stepIndex && i < powerNets.length; i++) {
      powerNets[i].defaultVoltage = 5.0;
    }
    return result;
  }

  buildAiQuestion(topo: SchTopology, selectedUuid: string): string {
    const dev = topo.deviceList.find(d => d.instUuid === selectedUuid);
    if (!dev) return '请解释当前电路的工作原理';
    return `请解释电路中 ${dev.refName}(${dev.libDevId}) 的作用，以及 surrounding 连接关系`;
  }
}
