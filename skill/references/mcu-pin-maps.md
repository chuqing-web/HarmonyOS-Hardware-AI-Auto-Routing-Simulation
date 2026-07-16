# MCU 引脚语义映射表

> 供 SemanticNetBuilder 动态解析 MCU 引脚功能，消除硬编码。
> 按引脚标签语义匹配，支持所有已注册 MCU 器件。

---

## 引脚语义分类

### 电源引脚 (Power)

| 语义标签 | 匹配模式 | 功能 | 连接规则 |
|----------|----------|------|----------|
| VCC | VCC, VDD, AVDD, VCCIO, VREF+ | 数字电源正极 | 接 VCC 网络 + 100nF 去耦到 GND |
| GND | GND, VSS, AVSS, VSSA | 数字电源地 | 接 GND 网络 |
| VDDA | VDDA, AVDD, VREF+ | 模拟电源正极 | 接 VCC 网络（经磁珠或 0Ω），+ 100nF+10uF 去耦 |
| VSSA | VSSA, AVSS, VREF- | 模拟电源地 | 接 GND 网络（单点），与数字地分离 |
| VCAP | VCAP, VCORE | 内核电压去耦 | 接 1-2.2uF 电容到 GND（STM32 专用） |
| VBAT | VBAT, VBACKUP | 备份电源 | 接 3V 电池或 VCC（经二极管） |

### 复位/控制引脚 (Control)

| 语义标签 | 匹配模式 | 功能 | 连接规则 |
|----------|----------|------|----------|
| NRST | RST, RESET, NRST, RST_N | 复位输入 | 接 10kΩ 上拉到 VCC + 100nF 到 GND |
| BOOT0 | BOOT0, BOOT_0 | 启动模式选择 | **必须接 GND**（正常运行），跳线可选接 VCC（烧录） |
| BOOT1 | BOOT1, BOOT_1 | 启动模式选择 | 接 GND（大多数情况） |
| SWCLK | SWCLK, TCK, SWD_CLK | SWD 调试时钟 | 预留引出（接 10kΩ 上拉可选） |
| SWDIO | SWDIO, TMS, SWD_IO | SWD 调试数据 | 预留引出（接 10kΩ 上拉可选） |

### 时钟引脚 (Clock)

| 语义标签 | 匹配模式 | 功能 | 连接规则 |
|----------|----------|------|----------|
| OSC_IN | OSC_IN, XTAL1, XIN, HSE_IN, XTAL_IN, PH0 | 晶振输入 | 接晶振 pin1 + 22pF 到 GND |
| OSC_OUT | OSC_OUT, XTAL2, XOUT, HSE_OUT, XTAL_OUT, PH1 | 晶振输出 | 接晶振 pin2 + 22pF 到 GND |
| OSC32_IN | OSC32_IN, LSE_IN, XTAL32_IN | 32K 晶振输入 | 接 32.768KHz 晶振 + 12pF 到 GND（可选） |
| OSC32_OUT | OSC32_OUT, LSE_OUT, XTAL32_OUT | 32K 晶振输出 | 接 32.768KHz 晶振 + 12pF 到 GND（可选） |

### 通信接口引脚 (Communication)

| 语义标签 | 匹配模式 | 功能 | 连接规则 |
|----------|----------|------|----------|
| UART_TX | TX, TXD, UART_TX, USART_TX, P3.1(51) | 串口发送 | 交叉接外部 RX |
| UART_RX | RX, RXD, UART_RX, USART_RX, P3.0(51) | 串口接收 | 交叉接外部 TX |
| I2C_SCL | SCL, I2C_SCL, I2C1_SCL, PB6, PB8, PB10 | I2C 时钟 | 接 4.7kΩ 上拉到 VCC |
| I2C_SDA | SDA, I2C_SDA, I2C1_SDA, PB7, PB9, PB11 | I2C 数据 | 接 4.7kΩ 上拉到 VCC |
| SPI_SCK | SCK, SCLK, SPI_SCK, SPI1_SCK | SPI 时钟 | - |
| SPI_MOSI | MOSI, SPI_MOSI, SPI1_MOSI, SDO | SPI 主出从入 | 接从设备 MOSI/DI |
| SPI_MISO | MISO, SPI_MISO, SPI1_MISO, SDI | SPI 主入从出 | 接从设备 MISO/DO |
| SPI_NSS | NSS, CS, SPI_NSS, SS, SPI1_NSS | SPI 片选 | 接从设备 CS（建议 10kΩ 上拉） |

### GPIO 引脚 (通用 IO)

| 语义标签 | 匹配模式 | 功能 | 连接规则 |
|----------|----------|------|----------|
| GPIO | PA, PB, PC, PD, PE, PF, P0, P1, P2, P3 | 通用 IO | 悬空时必须配置模式；输出可直接驱动 LED(+限流)；输入不可浮空 |
| ADC | ADC, ADC_IN, AIN, AN | 模拟输入 | 信号源阻抗 < 10kΩ |
| PWM | PWM, TIM_CH, TMR_CH, OC | PWM 输出 | - |
| EXTINT | EXTINT, INT, EXTI, IRQ | 外部中断 | 不可浮空 |

---

## 已注册 MCU 引脚详情

### STM32F103C8T6 (48脚, Cortex-M3)

```
引脚排列（DIP-48 封装）:
  左侧 P1-P24 (逆时针从左上角):
    P1  = VBAT      P13 = PA3/USART2_RX
    P2  = PC13      P14 = PA4/SPI1_NSS
    P3  = PC14-OSC32_IN  P15 = PA5/SPI1_SCK
    P4  = PC15-OSC32_OUT P16 = PA6/SPI1_MISO
    P5  = OSC_IN/PD0     P17 = PA7/SPI1_MOSI
    P6  = OSC_OUT/PD1    P18 = PB0/ADC_IN8
    P7  = NRST           P19 = PB1/ADC_IN9
    P8  = VSSA           P20 = PB2/BOOT1
    P9  = VDDA           P21 = PB10/I2C2_SCL
    P10 = PA0/ADC_IN0    P22 = PB11/I2C2_SDA
    P11 = PA1/ADC_IN1    P23 = VSS_2
    P12 = PA2/USART2_TX  P24 = VDD_2

  右侧 P25-P48 (顺时针从上):
    P25 = PA7/SPI1_...   P37 = PB8/I2C1_SCL
    ... (完整48脚定义)
    P44 = BOOT0          P48 = VDD_1

关键引脚语义:
  VDD     = P24, P36, P48 (三个 VDD，每个都需要 100nF 去耦!)
  VSS     = P23, P35, P47 (三个 GND)
  VDDA    = P9  (模拟电源，需独立滤波)
  VSSA    = P8  (模拟地)
  NRST    = P7  (复位)
  BOOT0   = P44 (必须接 GND 才能正常运行)
  BOOT1   = P20
  OSC_IN  = P5  (接 8MHz 晶振)
  OSC_OUT = P6  (接 8MHz 晶振)
  UART1_TX = P30 (PA9)
  UART1_RX = P31 (PA10)
  I2C1_SCL = P37 (PB8)
  I2C1_SDA = P38 (PB9)
  SWCLK    = P34 (PA14)
  SWDIO    = P33 (PA13)
```

**STM32F103 强制连接规则**:
1. P24, P36, P48 (VDD×3) —— **每个** 必须接 100nF 去耦电容到最近的 GND
2. P9 (VDDA) —— 必须接 10uF + 100nF 滤波到 P8 (VSSA)
3. P7 (NRST) —— 必须接 10kΩ 上拉到 VCC
4. P44 (BOOT0) —— **必须接 GND**（正常运行模式）
5. P5/P6 (OSC) —— 接 8MHz 晶振 + 22pF×2 到 GND

### AT89C51 (40脚, 8051)

```
引脚排列（DIP-40 封装）:
  P1  = P1.0/T2   P21 = P2.0/A8
  P2  = P1.1/T2EX P22 = P2.1/A9
  ... (完整40脚定义)
  P9  = RST       P29 = PSEN
  P10 = P3.0/RXD  P30 = ALE/PROG
  P11 = P3.1/TXD  P31 = EA/VPP
  P18 = XTAL2     P38 = P0.7/AD7
  P19 = XTAL1     P39 = P0.6/AD6
  P20 = VSS       P40 = VCC

关键引脚语义:
  VCC  = P40 (5V 供电)
  GND  = P20 (地)
  RST  = P9  (复位，高电平有效，需 10kΩ 上拉 + 10uF 到 VCC)
  XTAL1 = P19 (晶振输入)
  XTAL2 = P18 (晶振输出)
  UART_RX = P10 (P3.0)
  UART_TX = P11 (P3.1)
  EA   = P31 (必须接 VCC 使用内部程序存储器)
```

**AT89C51 强制连接规则**:
1. P40 (VCC) —— 接 5V 电源 + 100nF 去耦
2. P20 (GND) —— 接 GND
3. P9 (RST) —— 接 10kΩ 上拉 + 10uF 电解到 VCC（RC 复位）
4. P31 (EA) —— **必须接 VCC**（使用内部 ROM）
5. P18/P19 (XTAL) —— 接 11.0592MHz 晶振 + 22pF×2 到 GND
6. P0 口 (P32-P39) —— 必须外接 10kΩ 上拉电阻排

---

## 引脚解析算法

SemanticNetBuilder 应按以下优先级解析引脚：

```
1. 从 IComponentLibrary.getDeviceMeta(libDevId) 获取 meta.data.pin_list[]
2. 对每个 pin，按 pin_label 字符串匹配上表中的语义标签
3. 匹配优先级: 精确匹配 > 前缀匹配 > 子串包含
4. 如果 meta 中无 pin_list，回退到 TemplateSchematicKit.pinOffset() 硬编码表
5. 如果 pinOffset 也无匹配，回退到 genPinOffset() 通用 DIP 计算
```

### 匹配函数伪代码

```typescript
function resolvePinBySemantic(pinList: LibDevicePin[], semantic: string): LibDevicePin | null {
  const upper = semantic.toUpperCase();
  // 1. 精确匹配
  let match = pinList.find(p => p.pinLabel.toUpperCase() === upper);
  if (match) return match;
  // 2. 前缀匹配 (如 "VDD" 匹配 "VDD_1")
  match = pinList.find(p => p.pinLabel.toUpperCase().startsWith(upper));
  if (match) return match;
  // 3. 语义标签组匹配 (如 "VCC" 可匹配 "VDD", "AVDD")
  const aliases = SEMANTIC_ALIASES[upper] ?? [];
  for (const alias of aliases) {
    match = pinList.find(p => p.pinLabel.toUpperCase().includes(alias));
    if (match) return match;
  }
  return null;
}

const SEMANTIC_ALIASES: Record<string, string[]> = {
  'VCC':  ['VDD', 'AVDD', 'VCCIO'],
  'GND':  ['VSS', 'AVSS', 'VSSA'],
  'RST':  ['NRST', 'RESET', 'RST_N'],
  'XTAL_IN':  ['OSC_IN', 'XIN', 'XTAL1', 'HSE_IN'],
  'XTAL_OUT': ['OSC_OUT', 'XOUT', 'XTAL2', 'HSE_OUT'],
  'UART_TX': ['TX', 'TXD', 'USART_TX'],
  'UART_RX': ['RX', 'RXD', 'USART_RX'],
};
```
