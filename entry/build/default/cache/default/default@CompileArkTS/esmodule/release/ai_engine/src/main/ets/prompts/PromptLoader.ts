import type { PromptVarEntry } from '../internal/AiEngineTypes';
import { applyPromptVars } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
export interface PromptTemplate {
    id: string;
    version: string;
    system: string;
    userTemplate: string;
}
const DEVICE_SELECT_DEFAULT: PromptTemplate = {
    id: 'device_select_v1',
    version: '1.0.0',
    system: '你是资深硬件工程师。只输出 JSON：function_module、device_require_list（func/dev_type/param_constraint/priority，禁止具体型号）、circuit_constraint、oodFlags。',
    userTemplate: '用户需求：{{user_prompt}}\n场景：{{scene}}\n局部电路：{{partial_topo}}'
};
const LAYOUT_DEFAULT: PromptTemplate = {
    id: 'layout_v1',
    version: '1.0.0',
    system: '你是嵌入式布局专家。只输出 JSON：module_group、constraint_rules（adjacent/separate/central/edge）、signal_weight。禁止输出坐标。',
    userTemplate: '器件：{{device_list}}\n约束：{{circuit_constraint}}\nMCU：{{mcu_family}}'
};
const ROUTE_DEFAULT: PromptTemplate = {
    id: 'route_v1',
    version: '1.0.0',
    system: '你是布线工程师。只输出 JSON：net_priority、special_net_rules、global_constraint。禁止输出坐标点。',
    userTemplate: '拓扑摘要：{{topology_summary}}\n网络列表：{{net_list}}'
};
const DIAG_DEFAULT: PromptTemplate = {
    id: 'diag_v1',
    version: '1.0.0',
    system: '电路故障诊断专家，输出 markdown 分析报告。',
    userTemplate: 'ERC：{{erc_violations}}\n拓扑：{{topology}}'
};
const GEN_SCH_DEFAULT: PromptTemplate = {
    id: 'gen_sch_v1',
    version: '1.0.0',
    system: '生成 SchTopology JSON，禁止 markdown 包裹。',
    userTemplate: '需求：{{user_prompt}}\n库摘要：{{library_summary}}'
};
export class PromptLoader {
    static load(y313: string): PromptTemplate {
        switch (y313) {
            case 'device_select':
                return DEVICE_SELECT_DEFAULT;
            case 'layout':
                return LAYOUT_DEFAULT;
            case 'route':
                return ROUTE_DEFAULT;
            case 'diag':
                return DIAG_DEFAULT;
            case 'gen_sch':
                return GEN_SCH_DEFAULT;
            default:
                return DEVICE_SELECT_DEFAULT;
        }
    }
    static render(v313: PromptTemplate, w313: PromptVarEntry[]): string {
        const x313 = applyPromptVars(v313.userTemplate, w313);
        return `${v313.system}\n\n${x313}`;
    }
    static extractJson<o313>(p313: string): o313 | null {
        if (!p313) {
            return null;
        }
        const q313 = p313.trim();
        try {
            return JSON.parse(q313) as o313;
        }
        catch (r313) {
            const s313 = q313.indexOf('{');
            const t313 = q313.lastIndexOf('}');
            if (s313 >= 0 && t313 > s313) {
                try {
                    return JSON.parse(q313.substring(s313, t313 + 1)) as o313;
                }
                catch (u313) {
                    return null;
                }
            }
        }
        return null;
    }
}
