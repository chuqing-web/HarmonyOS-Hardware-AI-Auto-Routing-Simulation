import { mapAwareStringify, mapAwareParse } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { LabTemplateRegistry, ALL_CATALOG_LIBRARY_IDS } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateRegistry";
import type { LabTemplateDef, LabCoverageReport } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/LabTemplateRegistry";
import { PcbLabTemplateRegistry } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PcbLabTemplateRegistry";
import type { PcbLabTemplateDef } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/PcbLabTemplateRegistry";
import { DeviceUsageManual } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/DeviceUsageManual";
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
    /** 关联固件族: '8051' | 'STM32' */
    firmware?: string;
    /** 需烧录的 hex 文件名（hex_files 目录下） */
    hexFile?: string;
}
export interface KnowledgeTip {
    componentType: string;
    title: string;
    content: string;
}
/** PCB 教学模板（面板列表项） */
export interface PcbLabTemplate {
    id: string;
    name: string;
    category: string;
    description: string;
    knowledgePoints: string[];
    pcbFile: string;
}
export class TeachingService {
    private static readonly FW_51: TemplateFirmware = {
        mcuFamily: '8051',
        hexText: ':03000000020100FA\n' +
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
            libraryIds: def.libraryIds,
            firmware: def.firmware,
            hexFile: def.hexFile
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
    /** 知识点：读全库手册 */
    getKnowledgeTip(libraryId: string): KnowledgeTip | null {
        const manual = DeviceUsageManual.resolve(libraryId);
        if (!manual) {
            return null;
        }
        return {
            componentType: libraryId,
            title: `${manual.libDevId} — ${manual.title}`,
            content: `${manual.summary}\n真脚: ${manual.pins}\n典型接法: ${manual.typicalWiring}\n` +
                `禁例: ${manual.forbidden}\n参数: ${manual.params}\n仿真: ${manual.simNotes}`
        };
    }
    stepPowerOnSequence(topo: SchTopology, stepIndex: number): SchTopology {
        const result = mapAwareParse<SchTopology>(mapAwareStringify(topo));
        const powerNets = result.netList.filter(n => n.isPower);
        for (let i = 0; i <= stepIndex && i < powerNets.length; i++) {
            powerNets[i].defaultVoltage = 5.0;
        }
        return result;
    }
    private static toPcbLabTemplate(def: PcbLabTemplateDef): PcbLabTemplate {
        return {
            id: def.id,
            name: def.name,
            category: def.category,
            description: def.description,
            knowledgePoints: def.knowledgePoints,
            pcbFile: def.pcbFile
        };
    }
    listPcbTemplates(): PcbLabTemplate[] {
        return PcbLabTemplateRegistry.listTemplates().map(TeachingService.toPcbLabTemplate);
    }
    listPcbTemplatesByCategory(category: string): PcbLabTemplate[] {
        return PcbLabTemplateRegistry.listByCategory(category).map(TeachingService.toPcbLabTemplate);
    }
    listPcbCategories(): string[] {
        return PcbLabTemplateRegistry.listCategories();
    }
    getPcbTemplate(templateId: string): PcbLabTemplate | null {
        const def = PcbLabTemplateRegistry.findById(templateId);
        if (def === undefined) {
            return null;
        }
        return TeachingService.toPcbLabTemplate(def);
    }
    registerPcbTemplate(def: PcbLabTemplateDef): void {
        PcbLabTemplateRegistry.registerTemplate(def);
    }
    buildAiQuestion(topo: SchTopology, selectedUuid: string): string {
        const dev = topo.deviceList.find(d => d.instUuid === selectedUuid);
        if (!dev) {
            return '请解释当前电路的工作原理';
        }
        const miss: string[] = [];
        const usage = DeviceUsageManual.resolveWithLibraryFallback(dev.libDevId, null, miss);
        const neighbors: string[] = [];
        for (let i = 0; i < topo.netList.length; i++) {
            const n = topo.netList[i];
            let hit = false;
            for (let j = 0; j < (n.nodeList?.length ?? 0); j++) {
                if (n.nodeList[j].devUuid === selectedUuid) {
                    hit = true;
                    break;
                }
            }
            if (!hit) {
                continue;
            }
            const pins: string[] = [];
            for (let j = 0; j < (n.nodeList?.length ?? 0) && pins.length < 8; j++) {
                const node = n.nodeList[j];
                const d2 = topo.deviceList.find(x => x.instUuid === node.devUuid);
                pins.push(`${d2?.refName ?? '?'}.${node.pinId}`);
            }
            neighbors.push(`${n.netName}: ${pins.join(', ')}`);
        }
        return `请结合下列官方使用说明，解释电路中 ${dev.refName}(${dev.libDevId}) 的作用与连接。\n\n` +
            `【器件使用说明】\n${DeviceUsageManual.formatEntry(usage, 'full')}\n\n` +
            `【相关网络】\n${neighbors.length > 0 ? neighbors.join('\n') : '(无连接信息)'}`;
    }
}
