/**
 * 教学辅助 + 实验模板 + AI 答疑
 */
import { SchTopology } from 'common';
import {
  LabTemplateRegistry, LabTemplateDef, LabCoverageReport, ALL_CATALOG_LIBRARY_IDS
} from './algorithms/LabTemplateRegistry';

/** 模板关联的固件信息 */
export interface TemplateFirmware {
  hexText: string;
  mcuFamily: string;
}

export interface LabTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  knowledgePoints: string[];
  /** 本模板覆盖的器件 libraryId */
  libraryIds?: string[];
}

export interface KnowledgeTip {
  componentType: string;
  title: string;
  content: string;
}

export class TeachingService {
  private static tips: KnowledgeTip[] = [
    { componentType: 'LM358', title: '双运放 LM358', content: '双路运放，单电源可用；IN+ 与 IN- 虚短虚断' },
    { componentType: 'UA741', title: '运算放大器', content: '经典单运放；注意 VCC/VEE 双电源或单电源偏置' },
    { componentType: 'AT89C51', title: '51单片机', content: '4组IO口(P0~P3)，P0需外部上拉，EA 接 VCC 用内部程序' },
    { componentType: 'STM32F103', title: 'STM32', content: 'Cortex-M3，72MHz；USART1 常用 PA9/PA10 或 P10/P11' },
    { componentType: '74HC', title: 'CMOS 逻辑', content: '未用输入不可悬空；VCC 去耦 100nF 靠近芯片' },
  ];

  private static readonly FW_51: TemplateFirmware = {
    mcuFamily: '8051',
    hexText:
      ':03000000020100FA\n' +
      ':1301000074FEF59012010A2380F8780879FFD9FED8FA227A\n' +
      ':00000001FF\n'
  };
  private static readonly FW_STM32: TemplateFirmware = {
    mcuFamily: 'STM32',
    hexText:
      // USART init + RXNE echo + free-run TX 0x55. See tools/_build_lab_uart_hex.py
      ':020000040800F2\n' +
      ':1000000000100020010100080000000000000000B6\n' +
      ':10004000FEE70000000000000000000000000000CB\n' +
      ':100100000E480F4901600F480F4901600F48104920\n' +
      ':1001100081601049C16001782022114206D0037924\n' +
      ':10012000017880221142FBD00371F4E7017880222C\n' +
      ':100130001142F0D055210171EDE700BF18100240C7\n' +
      ':100140000004000000080140004B0000003801409E\n' +
      ':080150004C1D00000C20000012\n' +
      ':00000001FF\n'
  };

  private static toLabTemplate(def: LabTemplateDef): LabTemplate {
    return {
      id: def.id,
      name: def.name,
      category: def.category,
      description: def.description,
      knowledgePoints: def.knowledgePoints,
      libraryIds: def.libraryIds
    };
  }

  listTemplates(): LabTemplate[] {
    return LabTemplateRegistry.listTemplates().map(TeachingService.toLabTemplate);
  }

  listCategories(): string[] {
    return LabTemplateRegistry.listCategories();
  }

  listTemplatesByCategory(category: string): LabTemplate[] {
    return LabTemplateRegistry.listTemplates()
      .filter(t => t.category === category)
      .map(TeachingService.toLabTemplate);
  }

  getCoverageReport(): LabCoverageReport {
    return LabTemplateRegistry.getCoverageReport();
  }

  getAllCatalogLibraryIds(): string[] {
    return ALL_CATALOG_LIBRARY_IDS.slice();
  }

  /** 注册自定义实验模板（运行时扩展） */
  registerTemplate(def: LabTemplateDef): void {
    LabTemplateRegistry.registerTemplate(def);
  }

  /** 模板关联 hex 文件名（不含路径） */
  getTemplateHexFileName(templateId: string): string | null {
    const def = LabTemplateRegistry.findById(templateId);
    if (def === undefined || def.hexFile === undefined || def.hexFile.length === 0) {
      return null;
    }
    return def.hexFile;
  }

  getTemplateFirmware(templateId: string): TemplateFirmware | null {
    const def = LabTemplateRegistry.findById(templateId);
    if (def === undefined || def.firmware === undefined) {
      return null;
    }
    if (def.firmware === '8051') {
      return TeachingService.FW_51;
    }
    if (def.firmware === 'STM32') {
      return TeachingService.FW_STM32;
    }
    return null;
  }

  getKnowledgeTip(libraryId: string): KnowledgeTip | null {
    for (const tip of TeachingService.tips) {
      if (libraryId.includes(tip.componentType)) {
        return tip;
      }
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
    if (!dev) {
      return '请解释当前电路的工作原理';
    }
    return `请解释电路中 ${dev.refName}(${dev.libDevId}) 的作用，以及 surrounding 连接关系`;
  }
}
