import type { ComponentDefinition } from '../api/IComponentLibrary';
import { ComponentCategory } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { LibDevice, LibDevicePin, SimModelInfo, ParamLimit, Pin, PinType } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { copyParamMap, copyStringArray, paramMapGet, makePoint, libDeviceParamsToMap, applyParamsToLibRecord, emptyParams } from "@bundle:com.elecdraw.aischsim/entry@component_library/ets/internal/ComponentLibHelpers";
export class LibDeviceAdapter {
    static toLibDevice(w327: ComponentDefinition): LibDevice {
        const x327: LibDevicePin[] = [];
        for (let z327 = 0; z327 < w327.pins.length; z327++) {
            x327.push(LibDeviceAdapter.toPin(w327.pins[z327]));
        }
        const y327: LibDevice = {
            libDevId: w327.id,
            name: w327.name,
            vendor: w327.manufacturer,
            category: w327.category,
            subCategory: w327.category,
            svgSymbol: w327.svgSymbol,
            thumbnailBase64: '',
            pinList: x327,
            simModel: LibDeviceAdapter.toSimModel(w327),
            defaultParams: emptyParams(),
            paramLimit: LibDeviceAdapter.inferParamLimit(w327),
            isCustom: w327.id.startsWith('custom_'),
            supportMcuFirmware: w327.category === ComponentCategory.MCU_8051 ||
                w327.category === ComponentCategory.MCU_STM32,
            aiWiringRules: copyStringArray(w327.aiWiringRules)
        };
        applyParamsToLibRecord(y327, copyParamMap(w327.defaultParams));
        return y327;
    }
    static fromLibDevice(s327: LibDevice): ComponentDefinition {
        const t327: Pin[] = [];
        for (let v327 = 0; v327 < s327.pinList.length; v327++) {
            t327.push(LibDeviceAdapter.fromLibPin(s327.pinList[v327]));
        }
        const u327: ComponentDefinition = {
            id: s327.libDevId,
            name: s327.name,
            category: s327.category as ComponentCategory,
            manufacturer: s327.vendor,
            description: s327.name,
            pins: t327,
            defaultParams: libDeviceParamsToMap(s327),
            spiceModel: s327.simModel.modelText,
            behaviorModel: s327.simModel.modelType,
            svgSymbol: s327.svgSymbol,
            aiWiringRules: copyStringArray(s327.aiWiringRules)
        };
        return u327;
    }
    private static fromLibPin(p327: LibDevicePin): Pin {
        let q327: 'none' | 'pull_up' | 'pull_down' = 'none';
        if (p327.pullUp) {
            q327 = 'pull_up';
        }
        else if (p327.pullDown) {
            q327 = 'pull_down';
        }
        const r327: Pin = {
            id: p327.pinId,
            name: p327.pinLabel,
            number: p327.pinId,
            type: p327.pinType as PinType,
            position: makePoint(p327.x, p327.y),
            pullType: q327
        };
        return r327;
    }
    private static toPin(n327: Pin): LibDevicePin {
        const o327: LibDevicePin = {
            pinId: n327.id,
            pinLabel: n327.name,
            pinType: n327.type,
            x: n327.position.x,
            y: n327.position.y,
            pullUp: n327.pullType === 'pull_up',
            pullDown: n327.pullType === 'pull_down',
            maxVoltage: 5.0
        };
        return o327;
    }
    private static toSimModel(k327: ComponentDefinition): SimModelInfo {
        let l327: 'spice' | 'mcu_51' | 'mcu_stm32' | 'digital_event' = 'spice';
        if (k327.category === ComponentCategory.MCU_8051) {
            l327 = 'mcu_51';
        }
        else if (k327.category === ComponentCategory.MCU_STM32) {
            l327 = 'mcu_stm32';
        }
        else if (k327.category === ComponentCategory.DIGITAL_IC) {
            l327 = 'digital_event';
        }
        const m327: SimModelInfo = {
            modelType: l327,
            modelText: k327.spiceModel || k327.behaviorModel,
            modelVersion: '1.0'
        };
        return m327;
    }
    private static inferParamLimit(i327: ComponentDefinition): ParamLimit {
        const j327: ParamLimit = {};
        if (i327.category === ComponentCategory.PASSIVE && i327.id.startsWith('R_')) {
            j327.resistanceMin = '1';
            j327.resistanceMax = '10M';
            j327.powerMax = paramMapGet(i327.defaultParams, 'power', '0.25W');
        }
        if (i327.id.startsWith('C_')) {
            j327.voltageMax = paramMapGet(i327.defaultParams, 'voltage', '50V');
        }
        return j327;
    }
}
