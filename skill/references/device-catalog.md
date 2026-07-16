# 器件库完整目录

> 供 PromptLoader 动态注入到 LLM system prompt，确保 AI 只选用库内器件。
> 共 79 个器件（含 SVG 符号 + meta 定义），按功能类别分组。

---

## 1. 电阻 (Passive/Resistor) — 9 个

| libDevId | 名称 | 阻值 | 封装 | 引脚 | aiWiringRules | 参数约束 |
|----------|------|------|------|------|---------------|----------|
| R_10 | 10Ω 电阻 | 10Ω | 0805 | 1,2 | - | 0.25W |
| R_100 | 100Ω 电阻 | 100Ω | 0805 | 1,2 | - | 0.25W |
| R_330 | 330Ω 电阻 | 330Ω | 0805 | 1,2 | led-current-limit | 0.25W |
| R_1k | 1kΩ 电阻 | 1kΩ | 0805 | 1,2 | pull-up,pull-down,led-current-limit | 0.25W |
| R_4.7k | 4.7kΩ 电阻 | 4.7kΩ | 0805 | 1,2 | i2c-pull-up | 0.25W |
| R_10k | 10kΩ 电阻 | 10kΩ | 0805 | 1,2 | rst-pull-up,pull-up,pull-down | 0.25W |
| R_47k | 47kΩ 电阻 | 47kΩ | 0805 | 1,2 | voltage-divider | 0.25W |
| R_100k | 100kΩ 电阻 | 100kΩ | 0805 | 1,2 | voltage-divider | 0.25W |

---

## 2. 电容 (Passive/Capacitor) — 9 个

| libDevId | 名称 | 容值 | 耐压 | 引脚 | aiWiringRules | 参数约束 |
|----------|------|------|------|------|---------------|----------|
| C_10pF | 10pF 电容 | 10pF | 50V | 1,2 | xtal-load | - |
| C_22pF | 22pF 电容 | 22pF | 50V | 1,2 | xtal-load | - |
| C_100pF | 100pF 电容 | 100pF | 50V | 1,2 | hf-bypass | - |
| C_1nF | 1nF 电容 | 1nF | 50V | 1,2 | - | - |
| C_10nF | 10nF 电容 | 10nF | 50V | 1,2 | - | - |
| C_100nF | 100nF 电容 | 100nF | 50V | 1,2 | mcu-decoupling,must-connect-VDD | - |
| C_1uF | 1uF 电容 | 1uF | 50V | 1,2 | bulk-decoupling | - |
| C_10uF | 10uF 电容 | 10uF | 50V | 1,2 | bulk-decoupling,power-filter | - |
| C_100uF | 100uF 电容 | 100uF | 25V | 1,2 | power-filter | - |

---

## 3. 电感 (Passive/Inductor) — 1 个

| libDevId | 名称 | 感值 | 引脚 |
|----------|------|------|------|
| L_10uH | 10uH 电感 | 10uH | 1,2 |

---

## 4. 二极管 (Discrete/Diode) — 3 个

| libDevId | 名称 | 类型 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| 1N4148 | 1N4148 开关二极管 | signal | A,K | flyback-protection |
| 1N4007 | 1N4007 整流二极管 | rectifier | A,K | reverse-protection |
| 1N5819 | 1N5819 肖特基二极管 | schottky | A,K | reverse-protection |

---

## 5. LED — 1 个

| libDevId | 名称 | 颜色 | Vf | 引脚 | aiWiringRules | 参数约束 |
|----------|------|------|-----|------|---------------|----------|
| LED_RED | 红色 LED | 红 | ~2.0V | A(阳极),K(阴极) | needs-current-limit-resistor | If≤20mA, 串联330Ω@5V |

---

## 6. 晶体管/MOSFET (Discrete/Transistor) — 4 个

| libDevId | 名称 | 类型 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| 2N2222 | NPN 三极管 | BJT-NPN | B,C,E | gpio-drive,base-resistor-1k |
| 2N2907 | PNP 三极管 | BJT-PNP | B,C,E | high-side-switch |
| 2N7000 | N-MOSFET | MOS-N | G,D,S | logic-level-gate,gate-resistor-100 |
| IRF540 | N-MOSFET 功率管 | MOS-N | G,D,S | power-switch,gate-resistor-100 |

---

## 7. 晶振 (Passive/Crystal) — 2 个

| libDevId | 名称 | 频率 | 引脚 | aiWiringRules | 参数约束 |
|----------|------|------|------|---------------|----------|
| XTAL_8M | 8MHz 晶振 | 8MHz | 1,2 | mcu-crystal,needs-load-caps-22pF | 配 C_22pF ×2 到 GND |
| XTAL_11M | 11.0592MHz 晶振 | 11.0592MHz | 1,2 | mcu-crystal,needs-load-caps-22pF | 配 C_22pF ×2 到 GND |

---

## 8. MCU — 2 个

| libDevId | 名称 | 架构 | 引脚数 | 关键引脚 | aiWiringRules |
|----------|------|------|--------|----------|---------------|
| AT89C51 | AT89C51 8051 MCU | 8051 | 40 (P1-P40) | VCC=P40,GND=P20,RST=P9,XTAL=P18/P19,UART=P10/P11 | mcu-8051,needs-rst-pullup,needs-xtal,needs-decoupling |
| STM32F103C8T6 | STM32F103C8T6 | Cortex-M3 | 48 (P1-P48) | VDD=P48,GND=P24,NRST=P7,XTAL=P5/P6,UART1=P30/P31,BOOT0=P44 | mcu-stm32,needs-rst-pullup,needs-xtal,needs-decoupling,multi-VDD,needs-VCAP,needs-BOOT0-gnd |

---

## 9. 数字逻辑 (DigitalLogic) — 6 个

| libDevId | 名称 | 功能 | 引脚 |
|----------|------|------|------|
| 74HC04 | 六路反相器 | NOT gate ×6 | 1-14 (14=VCC,7=GND) |
| 74HC08 | 四路与门 | AND gate ×4 | 1-14 (14=VCC,7=GND) |
| 74HC32 | 四路或门 | OR gate ×4 | 1-14 (14=VCC,7=GND) |
| 74HC00 | 四路与非门 | NAND gate ×4 | 1-14 (14=VCC,7=GND) |
| 74HC02 | 四路或非门 | NOR gate ×4 | 1-14 (14=VCC,7=GND) |
| 74HC86 | 四路异或门 | XOR gate ×4 | 1-14 (14=VCC,7=GND) |

**74HC 系列通用规则**:
- 所有 74HC 的引脚 14 必须是 VCC(5V)，引脚 7 必须是 GND
- 未使用的输入引脚必须接 VCC 或 GND（不允许浮空）
- VCC 必须加 100nF 去耦电容

---

## 10. 存储器 (Memory) — 2 个

| libDevId | 名称 | 类型 | 引脚 |
|----------|------|------|------|
| 24C02 | 2Kbit EEPROM | I2C | 1-8 (A0/A1/A2/WP/SDA/SCL/VCC/GND) |
| W25Q64 | 64Mbit SPI Flash | SPI | 1-8 (CS/SO/WP/GND/DI/CLK/HOLD/VCC) |

**存储器通用规则**:
- I2C 器件 SDA/SCL 必须接 4.7kΩ 上拉电阻到 VCC

---

## 11. 运放/模拟IC (AnalogIC) — 1 个

| libDevId | 名称 | 类型 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| LM358 | 双路运放 | dual-opamp | OUT1,IN-1,IN+1,V-,IN+2,IN-2,OUT2,V+ | feedback-must-closed,needs-feedback-resistor |

---

## 12. 电源管理 (Power Management) — 3 个

| libDevId | 名称 | 输出电压 | 引脚 | aiWiringRules |
|----------|------|----------|------|---------------|
| LM7805 | 5V 线性稳压 | 5V | 1(IN),2(GND),3(OUT) | needs-input-cap,needs-output-cap |
| LM7812 | 12V 线性稳压 | 12V | 1(IN),2(GND),3(OUT) | needs-input-cap,needs-output-cap |
| AMS1117_3V3 | 3.3V LDO | 3.3V | 1(IN),2(GND),3(OUT) | needs-input-cap-10uF,needs-output-cap-10uF |

**稳压器通用规则**:
- IN 脚串联 ≥10uF 电解电容到 GND
- OUT 脚并联 ≥10uF + 100nF 到 GND
- GND 脚必须直接接 GND 网络

---

## 13. 传感器/特殊 (Sensor/Special) — 3 个

| libDevId | 名称 | 类型 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| DS18B20 | 数字温度传感器 | 1-Wire | VCC,DQ,GND | needs-pullup-4.7k-on-DQ |
| LDR | 光敏电阻 | analog | 1,2 | voltage-divider-top |
| HALL_SENSOR | 霍尔传感器 | digital | VCC,GND,OUT | needs-pullup-on-OUT |

---

## 14. 开关/保险/继电器 (Switch/Fuse/Relay) — 3 个

| libDevId | 名称 | 类型 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| SW_PUSH | 轻触按键 | momentary-NO | 1,2 | needs-pullup-or-pulldown |
| FUSE_1A | 1A 保险丝 | fuse | 1,2 | series-connect |
| RELAY_SPDT | 单刀双掷继电器 | SPDT | 1,2(线圈),COM,NO,NC | needs-flyback-diode,coil-needs-transistor-drive |

---

## 15. 显示器 (Display) — 2 个

| libDevId | 名称 | 接口 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| LCD1602 | 1602 字符液晶 | 8-bit parallel | 1-16 (VSS,VDD,VO,RS,RW,E,D0-D7,A,K) | needs-contrast-pot,needs-backlight-resistor |
| OLED_12864 | OLED 128×64 | I2C | VCC,GND,SDA,SCL | needs-i2c-pullup |

---

## 16. 蜂鸣器 (Buzzer) — 1 个

| libDevId | 名称 | 类型 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| BUZZER | 有源蜂鸣器 | active | 1(+),2(-) | needs-transistor-drive,needs-flyback-diode |

---

## 17. 虚拟仪器 (Instrument) — 8 个

| libDevId | 名称 | 通道 | 引脚 | aiWiringRules |
|----------|------|------|------|---------------|
| VCC | 直流电源正极 | - | VCC(1) | voltage-source-5V |
| GND | 直流电源地 | - | GND(1) | ground-reference |
| VAC | 交流电源 | - | 1,2 | - |
| OSCILLOSCOPE | 四通道示波器 | 4CH | CH1,CH2,CH3,CH4,GND | voltage-probe,high-impedance |
| VOLTMETER_DC | 直流电压表 | 1CH | V+,COM | voltage-probe,parallel-connect |
| AMMETER_DC | 直流电流表 | 1CH | I+,I- | current-sense,series-connect |
| FREQ_COUNTER | 频率计 | 1CH | IN,GND | - |
| LOGIC_ANALYZER | 逻辑分析仪 | 8CH | CH1-CH8,GND | - |
| POWER_METER | 功率计 | 1CH | V+,V-,I+,I- | - |
| UART_TERMINAL | 串口终端 | - | TX,RX,GND | cross-connect-tx-rx |
| VIRTUAL_METER | 虚拟万用表 | - | V,COM | voltage-probe,parallel-connect |

**仪器连接规则**:
- 电压表/万用表/示波器：**并联**到被测节点
- 电流表：**串联**到被测支路（VCC→I+→I-→负载）
- UART 终端：TX→MCU.RX, RX→MCU.TX（交叉连接）
- 所有仪器的 GND/COM 必须接电路 GND

---

## 18. 逻辑门 (Gates, 基本门) — 5 个

| libDevId | 名称 | 引脚 |
|----------|------|------|
| GATE_NOT | 非门 | IN,OUT |
| GATE_AND | 与门 | A,B,OUT |
| GATE_OR | 或门 | A,B,OUT |
| GATE_NAND | 与非门 | A,B,OUT |
| GATE_NOR | 或非门 | A,B,OUT |

---

## 器件选型优先级规则

1. **优先 exactModel**: 用户明确指定的型号 → exact 匹配
2. **语义搜索**: 按 func+devType+params 模糊搜索
3. **国产替代**: exactModel 不存在时查找 domestic_alt
4. **类别降级**: devType 大类匹配 → fuzzy 匹配
5. **OOD 拒绝**: 库内完全找不到时标记 oodFlags，**禁止编造**

命名规范：svg 文件使用小写蛇形命名（如 `crystal.svg`），libDevId 使用大驼峰（如 `XTAL_8M`），以 index.lib.json 中注册的 lib_dev_id 为准。
