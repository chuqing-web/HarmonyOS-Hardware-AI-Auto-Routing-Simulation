# 软件内所有电子元件存储文件完整规范

> 版本 1.0.0 | 器件库三分体存储标准

## 总述

所有器件统一采用 **JSON 主描述文件 + 独立矢量 SVG 图形文件 + 仿真模型附属文件** 三分体存储结构。内置 Proteus 全系器件、51/STM32 单片机、外设、仪器全部遵循同一套文件规范；用户自定义器件也复用该格式，器件库目录分层管理。

完整文件组 = `{器件ID}.meta.json`（主配置） + `{器件ID}.symbol.svg`（原理图符号） + `{器件ID}.model.spice / .model.mcu / .model.digital`（仿真模型）

## 一、器件库根目录结构

```
DeviceLibrary/
├─ Passive/          # 无源元件：电阻、电容、电感、晶振、排阻
│  ├─ Resistor/
│  ├─ Capacitor/
│  └─ Inductor/
├─ Discrete/         # 分立半导体：二极管、三极管、MOS、可控硅
├─ AnalogIC/         # 运放、LDO、DC-DC、基准源、功放
├─ DigitalLogic/     # 74HC/LS、CD4000逻辑芯片
├─ Memory/           # 24C02、W25Q64、62256、2764
├─ MCU/
│  ├─ MCS51/         # AT89C51、STC89C52、STC15
│  └─ STM32/         # F103、F407、L431
├─ Sensor/           # DS18B20、光敏、霍尔、压力传感器
├─ Peripheral/       # 数码管、LCD1602、按键、电机、继电器
├─ Instrument/       # 示波器、信号源、逻辑分析仪、串口终端
├─ UserCustom/       # 用户自制器件库
└─ index.lib.json    # 全库索引清单（快速检索缓存）
```

## 二、三类核心文件

### 1. 主描述文件 `xxx.meta.json`

存储分类、厂商、引脚定义、参数约束、仿真模型绑定、画布显示属性。所有模块读取器件信息均以此文件为准。

关键字段：

| 字段 | 说明 |
|------|------|
| `lib_dev_id` | 全局唯一器件 ID |
| `symbol_file` | 同目录 SVG 符号文件名 |
| `sim_model_file` | 仿真模型文件名 |
| `model_type` | `spice` / `mcu_51` / `mcu_stm32` / `digital` / `instrument` |
| `pin_list` | 引脚坐标与电气属性 |
| `default_params` | 默认参数 |
| `param_limit` | 参数约束 |
| `erc_check_rules` | ERC 校验规则 |
| `ai_route_constraint` | AI 布线约束 |

示例见 `DeviceLibrary/Passive/Resistor/R_10k.meta.json`、`DeviceLibrary/MCU/STM32/STM32F103C8T6.meta.json`。

### 2. 原理图符号 `xxx.symbol.svg`

矢量图形，画布直接渲染。规范要求：

1. 原点 `(0,0)` 为元件中心，引脚坐标与 `meta.json` 内 `pin_list` 完全匹配
2. 线条统一 1.2px 黑色
3. 预留 `REF`（位号）、`VALUE`（参数）文本占位，运行时动态填充

### 3. 仿真模型附属文件

| 后缀 | 用途 | 内核 |
|------|------|------|
| `.model.spice` | 无源/模拟 IC | Ngspice |
| `.model.mcu` | 51/STM32 单片机 JSON 配置 | MCU 模拟器 |
| `.model.digital` | 74/CD4000 行为级描述 | 数字事件引擎 |

## 三、特殊器件

| 类型 | 说明 |
|------|------|
| 虚拟仪器 | `model_type=instrument`，绑定内置测量模块 |
| 子电路 | `.subsch` 后缀，存放于 `SubCircuit/` |
| 用户自定义 | `UserCustom/`，`is_custom: true` |
| Proteus 导入 | 转换后生成三文件 + `proteus_mapping.index` |

## 四、加载逻辑

1. 拖拽器件 → 按 `lib_dev_id` 读 `meta.json`
2. 渲染 → 加载同目录 `symbol.svg`
3. 仿真 → 读 `sim_model_file`，送入对应内核
4. AI 布线 → 读 `ai_route_constraint`
5. ERC → 读 `erc_check_rules`

实现入口：`DeviceLibraryLoader.ets` → `ComponentLibraryImpl.initFromDeviceLibrary()`

## 五、文件优势

1. **解耦**：图形、参数、仿真模型分离
2. **标准化**：无源、IC、单片机、仪器共用结构
3. **轻量化**：SVG + 文本模型，无二进制冗余
4. **可拓展**：新增器件仅需 3 个文件
5. **可分享**：整套文件夹可打包跨设备加载

## 六、代码映射

| 规范类型 | ArkTS 类型 | 文件 |
|----------|-----------|------|
| `meta.json` | `DeviceMeta` | `common/types/DeviceLibraryTypes.ets` |
| 索引 | `DeviceLibraryIndex` | 同上 |
| MCU 模型 | `McuSimModel` | 同上 |
| 运行时定义 | `ComponentDefinition` | `component_library/api/IComponentLibrary.ets` |
