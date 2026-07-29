/**
 * 器件库三分体文件规范类型定义
 * meta.json + symbol.svg + model.(spice|mcu|digital)
 */

export type DeviceModelType = 'spice' | 'mcu_51' | 'mcu_stm32' | 'digital' | 'instrument' | 'opamp';

export type DeviceParamValue = string | number | boolean;

export interface DevicePinMeta {
  pin_id: string;
  pin_label: string;
  pin_type: string;
  x: number;
  y: number;
  pull_up?: boolean;
  pull_down?: boolean;
  max_voltage?: number;
}

export interface DeviceMeta {
  lib_dev_id: string;
  name: string;
  vendor: string;
  category: string;
  sub_category?: string;
  thumbnail?: string;
  symbol_file: string;
  sim_model_file?: string;
  model_type: DeviceModelType;
  is_mcu: boolean;
  is_custom: boolean;
  flash_size?: number;
  sram_size?: number;
  core_type?: string;
  support_fpu?: boolean;
  pin_list: DevicePinMeta[];
  default_params: Record<string, Object>;
  param_limit?: Record<string, Object>;
  erc_check_rules?: string[];
  ai_route_constraint?: Record<string, Object>;
}

export interface DeviceIndexEntry {
  lib_dev_id: string;
  name: string;
  category: string;
  sub_category?: string;
  meta_path: string;
  is_custom: boolean;
}

export interface DeviceLibraryIndex {
  version: string;
  generated_at: string;
  total_count: number;
  devices: DeviceIndexEntry[];
}

export interface ProteusMappingEntry {
  proteus_name: string;
  lib_dev_id: string;
}

export interface ProteusMappingIndex {
  version: string;
  mappings: ProteusMappingEntry[];
}

export interface McuSimModel {
  core_name?: string;
  core_type?: string;
  instruction_set?: string;
  instruction_count?: number;
  flash_addr_base?: string;
  sram_addr_base?: string;
  internal_ram_size?: number;
  peripheral_list?: string[];
  irq_map?: Record<string, Object>;
  boot_pin_logic?: Record<string, Object>;
  sfr_map?: Record<string, Object>;
  timer_count?: number;
  uart_support?: boolean;
  ext_int_count?: number;
  uart_virtual_terminal?: boolean;
}

export interface LoadedDeviceBundle {
  meta: DeviceMeta;
  metaDir: string;
  symbolSvg: string;
  simModelText: string;
}
