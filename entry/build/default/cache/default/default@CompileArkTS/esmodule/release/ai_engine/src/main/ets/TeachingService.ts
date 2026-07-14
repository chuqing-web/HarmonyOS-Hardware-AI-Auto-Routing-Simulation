import type { SchTopology } from 'common';
import { LabTemplateRegistry, ALL_CATALOG_LIBRARY_IDS } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateRegistry";
import type { LabTemplateDef, LabCoverageReport } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateRegistry";
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
        hexText: ':0300000002000100FA\n' +
            ':1201000074FEF59012010B2380F878FF79FFD9FED8FA2283\n' +
            ':00000001FF\n'
    };
    private static readonly FW_STM32: TemplateFirmware = {
        mcuFamily: 'STM32',
        hexText: ':40000000001000200101000841000008410000084100000841000008410000080000000000000000000000000000000041000008410000080000000041000008410000083E\n' +
            ':02004000FEE7D9\n' +
            ':4401000009480A4901600A480A4901600A480B4981600B498161017820221142FBD001790171F8E7000000001810024004400000000080140004B0000003801404C1D00000C200000FF\n' +
            ':00000001FF\n'
    };
    private static toLabTemplate(s314: LabTemplateDef): LabTemplate {
        return {
            id: s314.id,
            name: s314.name,
            category: s314.category,
            description: s314.description,
            knowledgePoints: s314.knowledgePoints,
            libraryIds: s314.libraryIds
        };
    }
    listTemplates(): LabTemplate[] {
        return LabTemplateRegistry.listTemplates().map(TeachingService.toLabTemplate);
    }
    listCategories(): string[] {
        return LabTemplateRegistry.listCategories();
    }
    listTemplatesByCategory(q314: string): LabTemplate[] {
        return LabTemplateRegistry.listTemplates()
            .filter(r314 => r314.category === q314)
            .map(TeachingService.toLabTemplate);
    }
    getCoverageReport(): LabCoverageReport {
        return LabTemplateRegistry.getCoverageReport();
    }
    getAllCatalogLibraryIds(): string[] {
        return ALL_CATALOG_LIBRARY_IDS.slice();
    }
    registerTemplate(p314: LabTemplateDef): void {
        LabTemplateRegistry.registerTemplate(p314);
    }
    getTemplateHexFileName(n314: string): string | null {
        const o314 = LabTemplateRegistry.findById(n314);
        if (o314 === undefined || o314.hexFile === undefined || o314.hexFile.length === 0) {
            return null;
        }
        return o314.hexFile;
    }
    getTemplateFirmware(l314: string): TemplateFirmware | null {
        const m314 = LabTemplateRegistry.findById(l314);
        if (m314 === undefined || m314.firmware === undefined) {
            return null;
        }
        if (m314.firmware === '8051') {
            return TeachingService.FW_51;
        }
        if (m314.firmware === 'STM32') {
            return TeachingService.FW_STM32;
        }
        return null;
    }
    getKnowledgeTip(j314: string): KnowledgeTip | null {
        for (const k314 of TeachingService.tips) {
            if (j314.includes(k314.componentType)) {
                return k314;
            }
        }
        return null;
    }
    stepPowerOnSequence(d314: SchTopology, e314: number): SchTopology {
        const f314 = JSON.parse(JSON.stringify(d314)) as SchTopology;
        const g314 = f314.netList.filter(i314 => i314.isPower);
        for (let h314 = 0; h314 <= e314 && h314 < g314.length; h314++) {
            g314[h314].defaultVoltage = 5.0;
        }
        return f314;
    }
    buildAiQuestion(z313: SchTopology, a314: string): string {
        const b314 = z313.deviceList.find(c314 => c314.instUuid === a314);
        if (!b314) {
            return '请解释当前电路的工作原理';
        }
        return `请解释电路中 ${b314.refName}(${b314.libDevId}) 的作用，以及 surrounding 连接关系`;
    }
}
