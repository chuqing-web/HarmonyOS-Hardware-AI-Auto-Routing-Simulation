import { ComponentCategory, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Pin } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentDefinition } from '../api/IComponentLibrary';
import type { DeviceMeta, DeviceParamValue, DevicePinMeta } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { deviceMetaParamsToMap, makePoint } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
export class DeviceMetaAdapter {
    static toComponentDefinition(l335: DeviceMeta, m335: string, n335: string): ComponentDefinition {
        const o335 = deviceMetaParamsToMap(l335, DeviceMetaAdapter.paramToString);
        const p335: string[] = [];
        if (l335.ai_route_constraint) {
            const u335: Record<string, Object> = l335.ai_route_constraint;
            const v335 = Object.keys(u335);
            for (let w335 = 0; w335 < v335.length; w335++) {
                const x335 = v335[w335];
                const y335: Object = u335[x335];
                if (typeof y335 === 'boolean') {
                    p335.push(x335);
                }
                else {
                    p335.push(`${x335}:${y335}`);
                }
            }
        }
        if (l335.erc_check_rules) {
            for (let t335 = 0; t335 < l335.erc_check_rules.length; t335++) {
                p335.push(`erc:${l335.erc_check_rules[t335]}`);
            }
        }
        const q335: Pin[] = [];
        for (let s335 = 0; s335 < l335.pin_list.length; s335++) {
            q335.push(DeviceMetaAdapter.toPin(l335.pin_list[s335]));
        }
        const r335: ComponentDefinition = {
            id: l335.lib_dev_id,
            name: l335.name,
            category: DeviceMetaAdapter.mapCategory(l335.category),
            manufacturer: l335.vendor,
            description: `${l335.name} (${l335.category})`,
            pins: q335,
            defaultParams: o335,
            spiceModel: l335.model_type === 'spice' ? n335 : '',
            behaviorModel: DeviceMetaAdapter.mapBehaviorModel(l335),
            svgSymbol: m335,
            aiWiringRules: p335
        };
        return r335;
    }
    static toPin(i335: DevicePinMeta): Pin {
        let j335: 'none' | 'pull_up' | 'pull_down' = 'none';
        if (i335.pull_up) {
            j335 = 'pull_up';
        }
        else if (i335.pull_down) {
            j335 = 'pull_down';
        }
        const k335: Pin = {
            id: i335.pin_id,
            name: i335.pin_label,
            number: i335.pin_id,
            type: DeviceMetaAdapter.mapPinType(i335.pin_type),
            position: makePoint(i335.x, i335.y),
            pullType: j335
        };
        return k335;
    }
    static mapCategory(h335: string): ComponentCategory {
        if (h335.startsWith('passive'))
            return ComponentCategory.PASSIVE;
        if (h335.startsWith('discrete'))
            return ComponentCategory.DISCRETE;
        if (h335.startsWith('analog'))
            return ComponentCategory.ANALOG_IC;
        if (h335.startsWith('digital'))
            return ComponentCategory.DIGITAL_IC;
        if (h335 === 'memory')
            return ComponentCategory.MEMORY;
        if (h335.startsWith('mcu_51') || h335 === 'mcs51')
            return ComponentCategory.MCU_8051;
        if (h335.startsWith('mcu_stm32'))
            return ComponentCategory.MCU_STM32;
        if (h335.startsWith('sensor'))
            return ComponentCategory.SENSOR;
        if (h335.startsWith('peripheral'))
            return ComponentCategory.PERIPHERAL;
        if (h335 === 'instrument')
            return ComponentCategory.INSTRUMENT;
        return ComponentCategory.PASSIVE;
    }
    static mapPinType(g335: string): PinType {
        switch (g335) {
            case 'input': return PinType.INPUT;
            case 'output': return PinType.OUTPUT;
            case 'power':
            case 'power_pos': return PinType.POWER;
            case 'power_neg':
            case 'ground': return PinType.GROUND;
            case 'analog_in':
            case 'analog_out':
            case 'inout_analog': return PinType.ANALOG;
            case 'boot': return PinType.INPUT;
            case 'open_collector': return PinType.OPEN_COLLECTOR;
            default: return PinType.PASSIVE;
        }
    }
    static mapBehaviorModel(f335: DeviceMeta): string {
        switch (f335.model_type) {
            case 'mcu_51': return '8051_behavioral';
            case 'mcu_stm32': return 'stm32_behavioral';
            case 'opamp': return 'opamp';
            case 'digital': return f335.lib_dev_id.toLowerCase();
            case 'instrument': return f335.lib_dev_id.toLowerCase();
            default: return '';
        }
    }
    static paramToString(e335: DeviceParamValue): string {
        if (typeof e335 === 'boolean')
            return e335 ? 'true' : 'false';
        return `${e335}`;
    }
    static defaultSymbol(s334: DeviceMeta): string {
        const t334 = s334.pin_list;
        let u334 = 0;
        let v334 = 40;
        let w334 = -10;
        let x334 = 10;
        for (let d335 = 0; d335 < t334.length; d335++) {
            u334 = Math.min(u334, t334[d335].x);
            v334 = Math.max(v334, t334[d335].x);
            w334 = Math.min(w334, t334[d335].y);
            x334 = Math.max(x334, t334[d335].y);
        }
        const y334 = v334 - u334 + 20;
        const z334 = x334 - w334 + 20;
        let a335 = `<svg width="${y334}" height="${z334}" viewBox="${u334 - 10} ${w334 - 10} ${y334} ${z334}" xmlns="http://www.w3.org/2000/svg">`;
        a335 += `<rect x="${u334}" y="${w334}" width="${v334 - u334}" height="${x334 - w334}" fill="none" stroke="#000" stroke-width="1.2"/>`;
        for (let b335 = 0; b335 < t334.length; b335++) {
            const c335 = t334[b335];
            a335 += `<circle cx="${c335.x}" cy="${c335.y}" r="2" fill="#000"/>`;
        }
        a335 += `<text x="0" y="${w334 - 4}" font-size="6" fill="#000" text-anchor="middle">REF</text>`;
        a335 += `<text x="0" y="${x334 + 8}" font-size="5" fill="#444" text-anchor="middle">VALUE</text>`;
        a335 += '</svg>';
        return a335;
    }
}
