# 器件库具名脚改造（MCU/存储/LCD/传感器）

## 变更摘要

`BuiltinComponents` 不再对 MCU/存储/LCD/传感器使用 `genPins`/`genMcuPins`/`twoPin` 占位，改为 `NamedDevicePins.ets` 真实功能脚名。

| 类别 | 示例脚名 |
|------|----------|
| 8051 | `P1.0`..`P1.7`, `RST`, `XTAL1/2`, `EA`, `VCC`, `GND` |
| STM32 | `VDD/VSS/NRST/BOOT0/OSC_IN/OUT`, `PAx/PBx/PCx` |
| LCD1602 | `VSS/VDD/V0/RS/RW/E/D0..D7/A/K` |
| 24C02 / W25Q64 | `SDA/SCL` / `CS/DI/DO/CLK` |
| 2764 / 62256 | `A*/D*/CE/OE/WE` |
| DS18B20 / HALL | `GND/DQ/VDD` / `VCC/OUT/GND` |
| CD4017 / LM2596 | 同步具名化 |

## 同步文件

- 实验模板：`LabTemplateBuilders.ets` + `tools/lab_templates/builders.mjs` + `kit.mjs`
- ERC：`common/.../ErcEngine.ets`
- 几何：`TemplateSchematicKit.ets`
- 仿真：8051 优先匹配 `P1.x`
- 手册：`DeviceUsageManual.ets`

## 注意

旧 `.schsim` 若仍写 `P48/P7` 等旧脚名，需重新导出实验模板或手工改脚。应用内「加载实验模板」走 builders 重建则自动用新脚名。
