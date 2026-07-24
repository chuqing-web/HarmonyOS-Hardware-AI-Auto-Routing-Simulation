# 标准电路模板参考 v3.0

> 对应 Test_Template/ 下的 15 个 .schsim 实验模板。
> 供 CircuitTemplates 强匹配 + DeviceSelectEngine 本地降级使用。
> **v3.0: 所有模板均包含仪器拓扑要求、连接方式、反模式警示。**

---

## 1. lab_passive — 无源元件实验

**关键词**: 电阻, 电容, 无源, 分压, 充放电

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 电阻 | R_1k, R_10k | ≥2 | 分压网络 |
| 电容 | C_100nF, C_10uF | ≥1 | RC 充放电 |
| 电源 | VCC, GND | 各1 | 5V 供电 |
| 电压表 | VOLTMETER_DC | 1 | 测量分压点 |

**网络拓扑**:
```
VCC — R_1k — SENSE — R_10k — GND
                  |
              VOLTMETER_DC(V+)
                  |
              VOLTMETER_DC(COM) — GND
```

**关键约束**:
- 分压中点引出 SENSE 网络标号
- 电压表并联在分压点上
- 如果用户要求 RC 充放电，R 和 C 串联，示波器并联在 C 两端

---

## 2. lab_power — 电源稳压实验

**关键词**: 7805, 稳压, 电源, 1117, LDO

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 稳压器 | LM7805 | 1 | 或 AMS1117_3V3 |
| 电解电容 | C_100uF | 1 | 输入滤波 |
| 电解电容 | C_10uF | 1 | 输出滤波 |
| 瓷片电容 | C_100nF | 2 | 输入/输出去耦 |
| 电源 | VCC(Vin), GND | 各1 | 输入 |
| 电压表 | VOLTMETER_DC | 1 | 测输出电压 |
| 负载电阻 | R_1k | 1 | 最小负载 |

**网络拓扑**:
```
VCC(Vin) — C_100uF — LM7805(IN)
                  |
LM7805(GND) — GND
                  |
LM7805(OUT) — C_10uF — C_100nF — R_1k — VOLTMETER_DC(V+) — GND
```

---

## 3. lab_amp — 运放放大实验

**关键词**: 运放, 放大, 同相, 反相, 跟随器

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 运放 | LM358 | 1 | 双运放 |
| 反馈电阻 | R_10k | 1 | 增益设置 |
| 输入电阻 | R_1k | 1 | 反相输入 |
| 电源 | VCC, GND | 各1 | |
| 示波器 | OSCILLOSCOPE | 1 | 观测输入输出 |
| 信号源 | VAC | 1 | 交流输入信号 |

**网络拓扑（反相放大）**:
```
VAC(1) — R_1k — LM358(IN-)
                 LM358(IN+) — GND
                 LM358(OUT) — R_10k — LM358(IN-)  (反馈)
                 LM358(V+)  — VCC
                 LM358(V-)  — GND
```

**关键约束**:
- 运放必须有反馈网络（闭环），不允许开环
- V+ 接 VCC, V- 接 GND
- 同相输入不可浮空

---

## 4. lab_digital — 数字逻辑实验

**关键词**: 74HC, 逻辑门, 与门, 或门, 非门

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 逻辑IC | 74HC04/74HC08/74HC32 | 1 | 根据需求 |
| 去耦电容 | C_100nF | 1 | IC VCC-GND |
| LED | LED_RED | 1-4 | 输出指示 |
| 限流电阻 | R_330 | 1-4 | LED 限流 |
| 电源 | VCC, GND | 各1 | 5V |
| 逻辑分析仪 | LOGIC_ANALYZER | 1 | 可选 |

**网络拓扑**:
```
VCC — 74HCxx(14)
      74HCxx(7) — GND
      C_100nF — 74HCxx(14) — 74HCxx(7)
      SW_PUSH — 74HCxx(IN)  (输入)
      74HCxx(OUT) — R_330 — LED_RED(A) — LED_RED(K) — GND
```

**关键约束**:
- 74HC 未使用的输入引脚必须接 VCC 或 GND（不允许浮空！）
- VCC 必须接 100nF 去耦电容
- 每个 LED 输出必须串联 330Ω 限流电阻

---

## 5. lab_51_led — 51 单片机 LED 控制

**关键词**: 51, STC, LED, 流水灯, 闪烁

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| MCU | AT89C51 | 1 | 或 STC89C52 |
| 晶振 | XTAL_11M | 1 | 11.0592MHz |
| 负载电容 | C_22pF | 2 | 晶振负载 |
| 去耦电容 | C_100nF | 1 | |
| 复位电阻 | R_10k | 1 | |
| 复位电容 | C_10uF | 1 | RC 复位 |
| LED | LED_RED | 8 | P1 口驱动 |
| 限流电阻 | R_330 | 8 | |
| 上拉电阻排 | R_10k | 1 | P0 口 |
| 电源 | VCC, GND | 各1 | |

**网络拓扑（简化）**:
```
VCC — R_10k — AT89C51(RST)
  |            |
  C_10uF      AT89C51(VCC=P40) — C_100nF — GND
  |            AT89C51(GND=P20) — GND
  GND          AT89C51(XTAL1=P19) — XTAL_11M(1) — C_22pF — GND
               AT89C51(XTAL2=P18) — XTAL_11M(2) — C_22pF — GND
               AT89C51(EA=P31) — VCC
               AT89C51(P10-P17) — R_330×8 — LED_RED×8(A) — LED_RED×8(K) — GND
```

---

## 6. lab_mcu_stm32 — STM32 最小系统

**关键词**: stm32, f103, 最小系统, ARM

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| MCU | STM32F103C8T6 | 1 | |
| 晶振 | XTAL_8M | 1 | 8MHz |
| 负载电容 | C_22pF | 2 | |
| 去耦电容 | C_100nF | 3 | VDD×3 |
| 大电容 | C_10uF | 1 | VDDA 滤波 |
| 复位电阻 | R_10k | 1 | NRST 上拉 |
| LED | LED_RED | 1 | PC13 板载 LED |
| 限流电阻 | R_330 | 1 | |
| 电源 | VCC, GND | 各1 | |

---

## 7. lab_filter — 滤波器实验

**关键词**: RC, 滤波, 低通, 高通, 截止频率

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 电阻 | R_1k, R_10k | ≥1 | 时间常数设置 |
| 电容 | C_100nF, C_10uF | ≥1 | |
| 电源 | VCC, GND | 各1 | |
| 示波器 | OSCILLOSCOPE | 1 | 观测输入/输出波形 |
| 信号源 | VAC | 1 | 扫频输入 |

**网络拓扑（低通）**:
```
VAC(1) — R_1k — FILT_OUT — C_100nF — GND
                  |
              OSCILLOSCOPE(CH1)
                  |
              OSCILLOSCOPE(GND) — GND
```

**仪器拓扑要求**:
- CH1 探针通过标号连接到 FILT_OUT 节点
- CH2（如有）连接到 VAC 输入端做对比
- 示波器 GND clip 必须接 GND（标号连接）

**关键约束**:
- fc = 1/(2πRC)，根据实验目标选择 R/C 值
- 信号源输出幅度 ≤ VCC/2 避免削波

---

## 8. lab_discrete — 分立器件实验

**关键词**: 三极管, MOSFET, BJT, 开关, 放大

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| NPN三极管 | 2N2222 | 1 | 或 2N3904 |
| 基极电阻 | R_1k | 1 | 限流 |
| 集电极电阻 | R_330 | 1 | 负载 |
| LED | LED_RED | 1 | 开关指示 |
| 电源 | VCC, GND | 各1 | |
| 电压表 | VOLTMETER_DC | 1 | 测 Vce |

**网络拓扑（共射开关）**:
```
VCC — R_330 — LED_RED(A) — LED_RED(K) — 2N2222(C)
                                          2N2222(B) — R_1k — SW_PUSH — VCC
                                          2N2222(E) — GND
                  VOLTMETER_DC(V+) — 2N2222(C)
                  VOLTMETER_DC(COM) — 2N2222(E)
```

**仪器拓扑要求**:
- 电压表 V+ 接集电极（测 Vce），COM 接发射极（GND）
- 电压表使用标号连接（SENSE_VC），禁止长导线跨过三极管

---

## 9. lab_sensor — 传感器实验

**关键词**: 传感器, DS18B20, 霍尔, 温度, 光敏

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 温度传感器 | DS18B20 | 1 | OneWire |
| 上拉电阻 | R_4.7k | 1 | DQ 上拉 |
| 电源 | VCC, GND | 各1 | 3.3V/5V |
| 电压表 | VOLTMETER_DC | 1 | 测输出 |
| MCU | AT89C51/STM32 | 1 | 读取数据 |

**网络拓扑（DS18B20）**:
```
VCC — DS18B20(VDD)
      DS18B20(DQ) — R_4.7k — VCC
      DS18B20(DQ) — AT89C51(P10)
      DS18B20(GND) — GND
      C_100nF — DS18B20(VDD) — GND  (去耦)
```

**仪器拓扑要求**:
- 电压表测量 VDD 供电电压（并联在 VDD-GND）
- 如需逻辑分析，用 LOGIC_ANALYZER 挂 DQ 线（标号连接）

---

## 10. lab_uart — UART 串口实验

**关键词**: UART, 串口, TX, RX, 波特率

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| MCU | STM32F103C8T6 | 1 | 或 AT89C51 |
| UART终端 | UART_TERMINAL | 1 | 虚拟串口监视器 |
| 最小系统器件 | (同 lab_51_led/lab_mcu_stm32) | 1套 | 晶振+复位+去耦 |
| 电源 | VCC, GND | 各1 | |

**网络拓扑**:
```
STM32(PA9=TX) — UART_TERMINAL(RX)
STM32(PA10=RX) — UART_TERMINAL(TX)
UART_TERMINAL(GND) — GND
```

**仪器拓扑要求**:
- UART_TERMINAL 全部用标号连接（joinByLabel），禁止导线
- TX↔RX 交叉连接（不是 TX→TX！）
- UART_TERMINAL 的 GND 必须接电路 GND（标号）

---

## 11. lab_memory — 存储器实验

**关键词**: EEPROM, Flash, 24C02, 存储

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| EEPROM | AT24C02 | 1 | I2C, 256×8 |
| 上拉电阻 | R_4.7k | 2 | SDA+SCL 上拉 |
| 去耦电容 | C_100nF | 1 | |
| MCU | STM32F103C8T6 | 1 | I2C 主机 |
| 电源 | VCC, GND | 各1 | |

**网络拓扑**:
```
VCC — R_4.7k — AT24C02(SDA)
VCC — R_4.7k — AT24C02(SCL)
AT24C02(SDA) — STM32(PB7)
AT24C02(SCL) — STM32(PB6)
AT24C02(VCC) — VCC — C_100nF — GND
AT24C02(GND) — GND
AT24C02(A0,A1,A2) — GND  (地址=0x50)
```

**仪器拓扑要求**:
- I2C 上拉电阻必须紧邻 AT24C02（≤100mil）
- SDA/SCL 网络用标号连接，避免跨芯片长导线
- 如需监视 I2C 通信，用 LOGIC_ANALYZER 挂 SDA+SCL（标号）

---

## 12. lab_peripheral — 外设接口实验

**关键词**: GPIO, 按键, 中断, 蜂鸣器, 继电器

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| MCU | STM32F103C8T6/AT89C51 | 1 | |
| 按键 | SW_PUSH | 2 | 上拉/下拉 |
| 上拉电阻 | R_10k | 2 | 按键上拉 |
| 蜂鸣器 | BUZZER | 1 | 或 LED |
| 限流电阻 | R_330 | 1 | |
| 电压表 | VOLTMETER_DC | 1 | 测量IO电平 |

**网络拓扑（按键+LED）**:
```
VCC — R_10k — SW_PUSH(1) — GND
       SW_PUSH(2) — MCU(PA0)  (按键检测)
MCU(PA1) — R_330 — LED_RED(A) — LED_RED(K) — GND
```

**仪器拓扑要求**:
- 电压表 V+ 通过标号连接到被测量 GPIO 引脚
- 电压表 COM 接 GND（标号）
- 如果测量多个 IO，用多块电压表分别测量不同引脚

---

## 13. lab_instruments — 仪器测量实验

**关键词**: 仪器, 示波器, 万用表, 电流表, 电压表, 频率计, 功率表, 逻辑分析仪, UART, 信号发生器

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 信号发生器 | SIGNAL_GEN | 1 | 1kHz 方波 → CLK |
| 电流表 | AMMETER_DC | 1 | 串联 |
| 功率表 | POWER_METER | 1 | I 串联 + V 跨负载 |
| 分压 | R_10k, POT_10k | 各1 | |
| 万用表 | VIRTUAL_METER | 1 | 四端 V/A/OHM/COM：DCV·ACV·Ω·AMP·二极管 |
| 频率计 | FREQ_COUNTER | 1 | IN→CLK |
| 示波器 | OSCILLOSCOPE | 1 | CH1–4 全接 |
| 十进制计数 | CD4017 | 1 | LA 激励 |
| 逻辑分析仪 | LOGIC_ANALYZER | 1 | CH1–7=Q0–Q6, CH8=CLK |
| 串口终端 | UART_TERMINAL | 1 | TX↔RX 环回 |
| 电源 | VCC, GND | 各1 | |

**网络拓扑（功能台）**:
```
VCC → A1.I+→I- → AM_OUT → PM.I+→I- → HI → R10k → TOP → POT → GND
                                      PM.V+↗          MID(W)→M1
                                      PM.V-→GND       TOP→VM1
SG1.OUT ── CLK ── FC.IN / OSC.CH1 / LA.CH8 / CD4017.CLK / VM1.V
VM1: V=CLK(DCV/ACV)  A=LED串联(AMP)  OHM=R_1k∥二极管(Ω/DIODE)  COM=GND
OSC: CH2=HI CH3=MID CH4=TOP GND=GND
LA: CH1..7 = Q0..Q6；UART TERM TX↔RX 环回 + GND
```

**仪器拓扑铁律（不可违反）**:
1. **电流表串联**: VCC→I+→I-→…→负载。I+/I- 绝不同网
2. **功率表**: I+/I- 串联切入；V+/V- 跨负载；禁止 I 路与 V 路完全同节点对
3. **万用表四端**: V 测电压；A-COM 串联测流；OHM-COM 测电阻/二极管；COM 共地
4. **示波器**: 至少 CH1+GND；教学台应接满 CH1–4；GND 用 stub+标号防并脚
5. **频率计 / LA / UART / 信号源**: 有信号脚必须有 GND/COM 回线
6. **仪器优先 joinByLabel**: 探针与被测点用同名标号，避免廊道误并

---

## 14. lab_analog_ic — 模拟IC实验

**关键词**: 比较器, 555, 定时器, 振荡器

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| 555定时器 | LM555 | 1 | 别名 NE555 等 |
| 电阻 | R_1k, R_10k | 各1 | 定时RC |
| 电容 | C_10uF, C_100nF | 各1 | |
| LED | LED_RED | 1 | 输出指示 |
| 限流电阻 | R_330 | 1 | |
| 电源 | VCC, GND | 各1 | 5V |
| 示波器 | OSCILLOSCOPE | 1 | 观测输出脉冲 |
| 频率计 | FREQ_COUNTER | 1 | 可选: 测量频率 |

**网络拓扑（多谐振荡器·无稳态）**:
```
VCC — R_1k — LM555(DISCH=7)
       R_10k — LM555(DISCH=7) — LM555(THRES=6) — LM555(TRIG=2) — C_10uF — GND
       LM555(RESET=4) — VCC
       LM555(VCC=8) — VCC — C_100nF — GND
       LM555(GND=1) — GND
       LM555(CTRL=5) — C_100nF — GND
       LM555(OUT=3) — R_330 — LED_RED(A) — LED_RED(K) — GND
```

**网络拓扑（单稳态延时·按键触发）**:
```
VCC — R_timing — LM555(DISCH)；THRES≡DISCH — C_timing — GND
VCC — R_pull — LM555(TRIG)；SW_PUSH：TRIG↔GND（按下拉低触发）
LM555(CTRL) — C_100nF — GND；RESET→VCC；OUT — R_330 — LED — GND
【硬禁】禁止改成 VCC→SW→R→C→GND 串联 RC 充放电
```

**仪器拓扑要求**:
- CH1 探针→OUT(3脚) 测输出方波（标号: LM555_OUT）
- CH2 探针→THRES(6脚) 测电容充放电波形（标号: 555_CAP）
- FREQ_COUNTER 输入→OUT(3脚)（标号连接）
- 所有仪器 GND→电路 GND

---

## 15. lab_mcu_8051 — 8051单片机实验

**关键词**: 8051, AT89C51, STC89C52, 51单片机

**器件清单**:
| 器件 | libDevId | 数量 | 备注 |
|------|----------|------|------|
| MCU | AT89C51 | 1 | |
| 晶振 | XTAL_11M | 1 | |
| 负载电容 | C_22pF | 2 | |
| 去耦电容 | C_100nF | 1 | |
| 复位电阻 | R_10k | 1 | |
| 复位电容 | C_10uF | 1 | |
| EA上拉 | R_10k | 1 | EA→VCC |
| 电源 | VCC, GND | 各1 | 5V |

**网络拓扑（最小系统）**:
```
VCC — AT89C51(VCC=P40) — C_100nF — GND
VCC — AT89C51(EA=P31)
VCC — R_10k — AT89C51(RST=P9)
  |            |
  C_10uF      GND
AT89C51(XTAL1=P19) — XTAL_11M(1) — C_22pF — GND
AT89C51(XTAL2=P18) — XTAL_11M(2) — C_22pF — GND
AT89C51(GND=P20) — GND
```

**仪器拓扑要求**:
- 电压表测 VCC 供电（V+→VCC, COM→GND，标号）
- 示波器 CH1→XTAL1 观测晶振波形（标号: XTAL_OSC）
- 逻辑分析仪挂 P1 口各引脚（标号连接）

**关键约束**:
- EA 必须接 VCC（使用内部 ROM）
- RST 上拉 10k 到 VCC + 10uF 到 GND 实现上电复位
- 晶振负载电容必接，否则不起振

---

## 通用规则 (所有模板共用)

### MCU 最小系统强制规则
1. **VDD 去耦**: 每个 VDD 引脚必须并接 1 个 100nF 电容到 GND，电容必须就近放置（≤50mil）
2. **晶振负载**: 晶振两脚各串 22pF 电容到 GND（必须！否则不起振）
3. **复位上拉**: NRST/RST 必须接 10kΩ 上拉电阻到 VCC
4. **BOOT0 接地**: STM32 的 BOOT0 必须接 GND（否则无法从 Flash 启动）
5. **EA 接 VCC**: 51 单片机的 EA 必须接 VCC（使用内部程序存储器）

### LED 驱动规则
1. LED 阳极(A)经限流电阻(220~1kΩ)接 IO/VCC
2. LED 阴极(K)接 GND 或 IO（低电平驱动）
3. 限流电阻计算: R = (VCC - Vf) / If, Vf≈2V, If≤20mA

### 模拟电路规则
1. 运放必须闭环（有反馈路径）
2. 输入端不可浮空
3. 模拟信号路径远离数字/时钟线

### 仪器连接规则 (v4.0 — 与 BuiltinComponents / SIM_CONN 对齐)

#### 电压表 (VOLTMETER_DC)
```
并联 — V+→被测高点，COM→低点/GND；joinByLabel；多表不同节点对
```

#### 电流表 (AMMETER_DC)
```
串联 — VCC→I+→I-→负载；I+/I- 异网；joinByLabel 优先
```

#### 四端万用表 (VIRTUAL_METER)
```
引脚: V, A, OHM, COM
档位: DCV / ACV / OHM / AMP / DIODE
- DCV/ACV: V∥被测，COM→GND
- AMP: A–COM 串联测流（勿并联）
- OHM/DIODE: OHM–COM 跨被测电阻/二极管（勿跨电源）
```

#### 功率表 (POWER_METER)
```
V+/V- 跨负载并测；I+/I- 串联切入供电回路
禁止 I 路与 V 路完全同节点对（典型错误：四脚全跨电源两端）
```

#### 示波器 (OSCILLOSCOPE)
```
CH1–CH4 探针 joinByLabel→被测节点；GND 用 stubLabel→GND
至少 CH1+GND；教学/全套仪器优先接满四通道
禁止 CH* 挂电源轨（测纹波除外）；禁止 CH 与 GND 同网
```

#### 逻辑分析仪 (LOGIC_ANALYZER)
```
CH1–CH8 + GND（禁止 CH0/D0）；joinByLabel；GND 必接
```

#### 信号发生器 / 频率计 / UART
```
SIGNAL_GEN: OUT,GND
FREQ_COUNTER: IN,GND
UART_TERMINAL: TX,RX,GND（交叉或环回）
有 OUT/IN/TX 则必须有 GND
```

### 仪器通用反模式 (v4.0)
1. **仪器 GND/COM 浮空** → SIM_CONN 阻断 / 测量无效
2. **对仪器引脚走长导线** → 用 joinByLabel
3. **功率表 I 与 V 同节点对** → 电流未串联
4. **万用表 A 并联 / OHM 跨 VCC** → 档位接法错误
5. **逻辑分析仪写 CH0/D0** → 库脚为 CH1–CH8
6. **示波器 GND 母线横穿 CH 脚列** → 用 stubLabel

---

## 运放自激振荡（滞回 + 积分闭环）— 禁止 SIGNAL_GEN

**关键词**: 自激, 闭环振荡, 弛张, 三角波反馈, 方波三角波发生器, 两片运放+滞回+积分

**正确 BOM**:
| 器件 | libDevId | 备注 |
|------|----------|------|
| 运放×2 或双运放×1 | UA741×2 / TL082 / LM358 | 一路滞回、一路积分 |
| 电阻 | R_100k, R_10k | 正反馈 + 积分输入 |
| 电容 | C_100nF | 积分反馈 |
| 电源 | VCC=12V, VEE=-12V, GND | 双电源 |
| 示波器 | OSCILLOSCOPE | CH1 方波 / CH2 三角 |

**硬禁**:
- ❌ SIGNAL_GEN（方波由比较器自产，不是外激励）
- ❌ 把「观测两路波形」当成要信号源
- ❌ 用外激励积分示教配方（SIG→R→IN-）冒充自激

**拓扑要点**:
```
比较器 OUT(方波) → R → 积分 IN-
C 跨接 积分 OUT ↔ IN-
积分 OUT → 反馈 → 比较器输入
OSC.CH1 ∥ 方波网；OSC.CH2 ∥ 三角网；GND→GND
```

**与「外激励积分示教」的区别**: 用户明确「信号源/输入方波/激励」才要 SIGNAL_GEN；写「闭环自激/反馈至比较器」则走本配方。
