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
    static load(name: string): PromptTemplate {
        switch (name) {
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
    static render(template: PromptTemplate, vars: PromptVarEntry[]): string {
        const user = applyPromptVars(template.userTemplate, vars);
        return `${template.system}\n\n${user}`;
    }
    /** 从 LLM 响应中提取 JSON 对象 */
    static extractJson<T>(content: string): T | null {
        if (!content) {
            return null;
        }
        const trimmed = content.trim();
        try {
            return JSON.parse(trimmed) as T;
        }
        catch (_e) {
            const start = trimmed.indexOf('{');
            const end = trimmed.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return JSON.parse(trimmed.substring(start, end + 1)) as T;
                }
                catch (_e2) {
                    return null;
                }
            }
        }
        return null;
    }
}
