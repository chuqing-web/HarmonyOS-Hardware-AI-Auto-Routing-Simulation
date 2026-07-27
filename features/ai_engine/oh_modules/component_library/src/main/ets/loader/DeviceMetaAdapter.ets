/**
 * DeviceMeta ↔ ComponentDefinition 双向适配
 */
import { ComponentCategory, Pin, PinType } from 'common';
import { ComponentDefinition } from '../api/IComponentLibrary';
import { DeviceMeta, DeviceParamValue, DevicePinMeta } from 'common';
import { deviceMetaParamsToMap, makePoint } from '../internal/ComponentLibHelpers';

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
        } else {
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
      pins.push(DeviceMetaAdapter.toPin(meta.pin_list[i], i));
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

  static toPin(pin: DevicePinMeta, listIndex: number = 0): Pin {
    let pullType: 'none' | 'pull_up' | 'pull_down' = 'none';
    if (pin.pull_up) {
      pullType = 'pull_up';
    } else if (pin.pull_down) {
      pullType = 'pull_down';
    }
    // meta 规范：pin_id=封装数字、pin_label=语义名（STM32: "42"/"PB11"；LM358: "1"/"OUT1"）。
    // 运行时 Pin：id/name=语义 label，number=数字 pin_id，供 AI 建网与 SPICE DIP 映射。
    // 兼容旧稿：若 pin_id 已是语义名，则 number 用 pin_list 序（1-based）。
    const rawId = `${pin.pin_id ?? ''}`.trim();
    const label = `${pin.pin_label ?? ''}`.trim();
    const numericId = /^\d+$/.test(rawId);
    const useSemantic = numericId && label.length > 0 && label.toUpperCase() !== rawId.toUpperCase();
    let number = rawId.length > 0 ? rawId : label;
    if (useSemantic) {
      number = rawId;
    } else if (!numericId && rawId.length > 0) {
      number = `${listIndex + 1}`;
    }
    const result: Pin = {
      id: useSemantic ? label : (rawId.length > 0 ? rawId : label),
      name: label.length > 0 ? label : rawId,
      number: number,
      type: DeviceMetaAdapter.mapPinType(pin.pin_type),
      position: makePoint(pin.x, pin.y),
      pullType: pullType
    };
    return result;
  }

  static mapCategory(category: string): ComponentCategory {
    const lower = category.toLowerCase();
    if (lower.startsWith('passive')) return ComponentCategory.PASSIVE;
    if (lower.startsWith('discrete')) return ComponentCategory.DISCRETE;
    if (lower.startsWith('analog')) return ComponentCategory.ANALOG_IC;
    if (lower.startsWith('digital')) return ComponentCategory.DIGITAL_IC;
    if (lower === 'memory' || lower.startsWith('memory')) return ComponentCategory.MEMORY;
    if (lower.startsWith('mcu_51') || lower === 'mcs51' || lower.startsWith('mcu_8051')) {
      return ComponentCategory.MCU_8051;
    }
    if (lower.startsWith('mcu_stm32') || lower.startsWith('stm32')) {
      return ComponentCategory.MCU_STM32;
    }
    if (lower.startsWith('sensor')) return ComponentCategory.SENSOR;
    if (lower.startsWith('peripheral')) return ComponentCategory.PERIPHERAL;
    if (lower === 'instrument' || lower.startsWith('instrument')) {
      return ComponentCategory.INSTRUMENT;
    }
    if (lower.startsWith('power') || lower === 'power_supply' || lower === 'supply') {
      return ComponentCategory.POWER_SUPPLY;
    }
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
    const id = meta.lib_dev_id.toUpperCase();
    if (id === 'VCC') return 'vcc';
    if (id === 'GND') return 'gnd';
    if (id === 'VEE') return 'vee';
    if (id === 'VAC') return 'ac_source';
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
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    return `${val}`;
  }

  static defaultSymbol(meta: DeviceMeta): string {
    const pins = meta.pin_list;
    let minX = 0; let maxX = 40; let minY = -10; let maxY = 10;
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
