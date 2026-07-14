import { ComponentCategory, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { Pin } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { ComponentDefinition } from '../api/IComponentLibrary';
import type { DeviceMeta, DeviceParamValue, DevicePinMeta } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { deviceMetaParamsToMap, makePoint } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
export class DeviceMetaAdapter {
    static toComponentDefinition(meta: DeviceMeta, symbolSvg: string, simModel: string): ComponentDefinition {
        const defaultParams = deviceMetaParamsToMap(meta, DeviceMetaAdapter.paramToString);
        const aiRules: string[] = [];
        if (meta.ai_route_constraint) {
            const constraints: Record<string, Object> = meta.ai_route_constraint;
            const constraintKeys = Object.keys(constraints);
            for (let i = 0; i < constraintKeys.length; i++) {
                const key = constraintKeys[i];
                const val: Object = constraints[key];
                if (typeof val === 'boolean') {
                    aiRules.push(key);
                }
                else {
                    aiRules.push(`${key}:${val}`);
                }
            }
        }
        if (meta.erc_check_rules) {
            for (let i = 0; i < meta.erc_check_rules.length; i++) {
                aiRules.push(`erc:${meta.erc_check_rules[i]}`);
            }
        }
        const pins: Pin[] = [];
        for (let i = 0; i < meta.pin_list.length; i++) {
            pins.push(DeviceMetaAdapter.toPin(meta.pin_list[i]));
        }
        const def: ComponentDefinition = {
            id: meta.lib_dev_id,
            name: meta.name,
            category: DeviceMetaAdapter.mapCategory(meta.category),
            manufacturer: meta.vendor,
            description: `${meta.name} (${meta.category})`,
            pins: pins,
            defaultParams: defaultParams,
            spiceModel: meta.model_type === 'spice' ? simModel : '',
            behaviorModel: DeviceMetaAdapter.mapBehaviorModel(meta),
            svgSymbol: symbolSvg,
            aiWiringRules: aiRules
        };
        return def;
    }
    static toPin(pin: DevicePinMeta): Pin {
        let pullType: 'none' | 'pull_up' | 'pull_down' = 'none';
        if (pin.pull_up) {
            pullType = 'pull_up';
        }
        else if (pin.pull_down) {
            pullType = 'pull_down';
        }
        const result: Pin = {
            id: pin.pin_id,
            name: pin.pin_label,
            number: pin.pin_id,
            type: DeviceMetaAdapter.mapPinType(pin.pin_type),
            position: makePoint(pin.x, pin.y),
            pullType: pullType
        };
        return result;
    }
    static mapCategory(category: string): ComponentCategory {
        if (category.startsWith('passive'))
            return ComponentCategory.PASSIVE;
        if (category.startsWith('discrete'))
            return ComponentCategory.DISCRETE;
        if (category.startsWith('analog'))
            return ComponentCategory.ANALOG_IC;
        if (category.startsWith('digital'))
            return ComponentCategory.DIGITAL_IC;
        if (category === 'memory')
            return ComponentCategory.MEMORY;
        if (category.startsWith('mcu_51') || category === 'mcs51')
            return ComponentCategory.MCU_8051;
        if (category.startsWith('mcu_stm32'))
            return ComponentCategory.MCU_STM32;
        if (category.startsWith('sensor'))
            return ComponentCategory.SENSOR;
        if (category.startsWith('peripheral'))
            return ComponentCategory.PERIPHERAL;
        if (category === 'instrument')
            return ComponentCategory.INSTRUMENT;
        return ComponentCategory.PASSIVE;
    }
    static mapPinType(pinType: string): PinType {
        switch (pinType) {
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
    static mapBehaviorModel(meta: DeviceMeta): string {
        switch (meta.model_type) {
            case 'mcu_51': return '8051_behavioral';
            case 'mcu_stm32': return 'stm32_behavioral';
            case 'opamp': return 'opamp';
            case 'digital': return meta.lib_dev_id.toLowerCase();
            case 'instrument': return meta.lib_dev_id.toLowerCase();
            default: return '';
        }
    }
    static paramToString(val: DeviceParamValue): string {
        if (typeof val === 'boolean')
            return val ? 'true' : 'false';
        return `${val}`;
    }
    static defaultSymbol(meta: DeviceMeta): string {
        const pins = meta.pin_list;
        let minX = 0;
        let maxX = 40;
        let minY = -10;
        let maxY = 10;
        for (let i = 0; i < pins.length; i++) {
            minX = Math.min(minX, pins[i].x);
            maxX = Math.max(maxX, pins[i].x);
            minY = Math.min(minY, pins[i].y);
            maxY = Math.max(maxY, pins[i].y);
        }
        const w = maxX - minX + 20;
        const h = maxY - minY + 20;
        let svg = `<svg width="${w}" height="${h}" viewBox="${minX - 10} ${minY - 10} ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="none" stroke="#000" stroke-width="1.2"/>`;
        for (let i = 0; i < pins.length; i++) {
            const p = pins[i];
            svg += `<circle cx="${p.x}" cy="${p.y}" r="2" fill="#000"/>`;
        }
        svg += `<text x="0" y="${minY - 4}" font-size="6" fill="#000" text-anchor="middle">REF</text>`;
        svg += `<text x="0" y="${maxY + 8}" font-size="5" fill="#444" text-anchor="middle">VALUE</text>`;
        svg += '</svg>';
        return svg;
    }
}
