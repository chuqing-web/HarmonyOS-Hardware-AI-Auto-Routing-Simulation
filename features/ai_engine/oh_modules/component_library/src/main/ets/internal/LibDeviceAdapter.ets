/**
 * ComponentDefinition ↔ LibDevice 转换适配器
 */
import { ComponentDefinition } from '../api/IComponentLibrary';
import {
  LibDevice, LibDevicePin, SimModelInfo, ParamLimit,
  ComponentCategory, Pin, PinType
} from 'common';
import {
  copyParamMap, copyStringArray, paramMapGet, makePoint,
  libDeviceParamsToMap, applyParamsToLibRecord, emptyParams
} from './ComponentLibHelpers';

export class LibDeviceAdapter {
  static toLibDevice(def: ComponentDefinition): LibDevice {
    const pinList: LibDevicePin[] = [];
    for (let i = 0; i < def.pins.length; i++) {
      pinList.push(LibDeviceAdapter.toPin(def.pins[i]));
    }
    const device: LibDevice = {
      libDevId: def.id,
      name: def.name,
      vendor: def.manufacturer,
      category: def.category,
      subCategory: def.category,
      svgSymbol: def.svgSymbol,
      thumbnailBase64: '',
      pinList: pinList,
      simModel: LibDeviceAdapter.toSimModel(def),
      defaultParams: emptyParams(),
      paramLimit: LibDeviceAdapter.inferParamLimit(def),
      isCustom: def.id.startsWith('custom_'),
      supportMcuFirmware: def.category === ComponentCategory.MCU_8051 ||
        def.category === ComponentCategory.MCU_STM32,
      aiWiringRules: copyStringArray(def.aiWiringRules)
    };
    applyParamsToLibRecord(device, copyParamMap(def.defaultParams));
    return device;
  }

  static fromLibDevice(lib: LibDevice): ComponentDefinition {
    const pins: Pin[] = [];
    for (let i = 0; i < lib.pinList.length; i++) {
      pins.push(LibDeviceAdapter.fromLibPin(lib.pinList[i]));
    }
    const def: ComponentDefinition = {
      id: lib.libDevId,
      name: lib.name,
      category: lib.category as ComponentCategory,
      manufacturer: lib.vendor,
      description: lib.name,
      pins: pins,
      defaultParams: libDeviceParamsToMap(lib),
      spiceModel: lib.simModel.modelText,
      behaviorModel: lib.simModel.modelType,
      svgSymbol: lib.svgSymbol,
      aiWiringRules: copyStringArray(lib.aiWiringRules)
    };
    return def;
  }

  private static fromLibPin(p: LibDevicePin): Pin {
    let pullType: 'none' | 'pull_up' | 'pull_down' = 'none';
    if (p.pullUp) {
      pullType = 'pull_up';
    } else if (p.pullDown) {
      pullType = 'pull_down';
    }
    const pin: Pin = {
      id: p.pinId,
      name: p.pinLabel,
      number: p.pinId,
      type: p.pinType as PinType,
      position: makePoint(p.x, p.y),
      pullType: pullType
    };
    return pin;
  }

  private static toPin(p: Pin): LibDevicePin {
    const pin: LibDevicePin = {
      pinId: p.id,
      pinLabel: p.name,
      pinType: p.type,
      x: p.position.x,
      y: p.position.y,
      pullUp: p.pullType === 'pull_up',
      pullDown: p.pullType === 'pull_down',
      maxVoltage: 5.0
    };
    return pin;
  }

  private static toSimModel(def: ComponentDefinition): SimModelInfo {
    let modelType: 'spice' | 'mcu_51' | 'mcu_stm32' | 'digital_event' = 'spice';
    if (def.category === ComponentCategory.MCU_8051) {
      modelType = 'mcu_51';
    } else if (def.category === ComponentCategory.MCU_STM32) {
      modelType = 'mcu_stm32';
    } else if (def.category === ComponentCategory.DIGITAL_IC) {
      modelType = 'digital_event';
    }
    const model: SimModelInfo = {
      modelType: modelType,
      modelText: def.spiceModel || def.behaviorModel,
      modelVersion: '1.0'
    };
    return model;
  }

  private static inferParamLimit(def: ComponentDefinition): ParamLimit {
    const limit: ParamLimit = {};
    if (def.category === ComponentCategory.PASSIVE && def.id.startsWith('R_')) {
      limit.resistanceMin = '1';
      limit.resistanceMax = '10M';
      limit.powerMax = paramMapGet(def.defaultParams, 'power', '0.25W');
    }
    if (def.id.startsWith('C_')) {
      limit.voltageMax = paramMapGet(def.defaultParams, 'voltage', '50V');
    }
    return limit;
  }
}
