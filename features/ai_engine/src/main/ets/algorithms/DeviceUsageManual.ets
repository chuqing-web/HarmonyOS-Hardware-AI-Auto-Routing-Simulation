/**
 * 全库器件使用说明手册 — AI 选型后注入 layout/net_plan/route
 * 与 ALL_CATALOG_LIBRARY_IDS / BuiltinComponents 同步维护
 */
import { IComponentLibrary } from 'component_library';
import { ALL_CATALOG_LIBRARY_IDS } from './LabTemplateRegistry';

export type UsageManualMode = 'full' | 'compact';

export interface DeviceUsageEntry {
  /** 精确 libDevId；空串表示仅族模板 */
  libDevId: string;
  title: string;
  /** 用途摘要 */
  summary: string;
  /** 真脚含义 */
  pins: string;
  /** 典型接法 */
  typicalWiring: string;
  /** 禁例 */
  forbidden: string;
  /** 关键参数 */
  params: string;
  /** 仿真注意 */
  simNotes: string;
  /** 优先级：越高越不易被 token 裁剪 */
  priority: number;
}

interface FamilyTemplate {
  /** 前缀或正则风格前缀匹配，如 R_ / 74HC / STM32 */
  prefix: string;
  entry: DeviceUsageEntry;
}

const MAX_CHARS_FULL_BLOCK = 8000;
const MAX_CHARS_PER_DEVICE_FULL = 800;
const MAX_CHARS_COMPACT_BLOCK = 3500;

function entry(
  id: string, title: string, summary: string, pins: string,
  typicalWiring: string, forbidden: string, params: string,
  simNotes: string, priority: number
): DeviceUsageEntry {
  const e: DeviceUsageEntry = {
    libDevId: id,
    title: title,
    summary: summary,
    pins: pins,
    typicalWiring: typicalWiring,
    forbidden: forbidden,
    params: params,
    simNotes: simNotes,
    priority: priority
  };
  return e;
}

/** 精确 ID 手册（高优先级 IC/MCU/仪器/分立） */
function buildExactEntries(): DeviceUsageEntry[] {
  return [
    // —— 电源符号 ——
    entry('VCC', '正电源', '可调正电源轨符号，扇出到各器件电源脚。',
      '1=VCC 输出脚',
      '用 joinByLabel 并入 VCC 网；多负载勿拉满屏导线。AI 选型须在 param_constraint.voltage 决定幅值。',
      '禁止与 GND 同网；禁止把信号脚标成 VCC；双电源时勿留 5V 配 VEE=-12V。',
      'voltage：数字/MCU 常 5V/3.3V；运放双电源常 12V/15V',
      '仿真作理想电压源', 6),
    entry('VEE', '负电源', '运放双电源负轨。',
      '1=VEE',
      'UA741/TL082 等双电源运放必须接 VEE；单电源运放可不用。AI 选型须写 param_constraint.voltage（与 |VCC| 对称）。',
      '禁止正电压；禁止与 VCC 短接。',
      'voltage 常 -12V/-15V/-5V',
      '理想负压源', 6),
    entry('GND', '地', '系统地参考。',
      '1=GND',
      '所有 GND/VSS/COM/仪器地最终并入 GND 网（标号）。',
      '禁止浮空地；禁止把地当信号线乱用名。',
      '无参数',
      '0V 参考', 6),
    entry('VAC', '交流源', '正弦交流电压源。',
      'AC+/AC-',
      '跨接被测回路；常与示波器/整流实验同用。',
      '禁止两脚同网短路。',
      'amplitude/frequency',
      '交流激励', 5),
    entry('SIGNAL_GEN', '函数信号源', '正弦/方波/三角/锯齿/脉冲激励。',
      'OUT/GND（以库脚为准）',
      'OUT→被测输入；GND→系统地；示波器并测 OUT。滞回/施密特整形：amplitude 峰值须 >|Vth|（Rf/Rg≈10:1、±12V 时约 1V），禁止用库默认 1V；推荐 5V（≥2V）。',
      '禁止 OUT 直接短到 VCC/GND；禁止滞回场景 amplitude<2V（会锁死单轨、示波器只见一次翻转后平线）。',
      'waveform、amplitude、frequency、offset、dutyCycle',
      '瞬态激励源', 8),

    // —— 继电器/开关/蜂鸣器 ——
    entry('SW_PUSH', '轻触开关', '瞬时通断，常作复位/按键/继电器线圈驱动。',
      '1/2 两端',
      '串联于 VCC→线圈 或 GPIO 回路；默认常开。',
      '禁止当 SPDT 多触点用；禁止两端同网短路。',
      '无',
      '理想开关', 5),
    entry('RELAY_SPDT', '单刀双掷继电器', '线圈驱动，触点 COM 在 NO/NC 间切换。',
      '1/2=线圈；COM/NO/NC=触点（以库脚为准）',
      '线圈: VCC→SW→1，2→GND；触点负载经 COM 选 NO 或 NC；双色 LED 指示须跟触点拓扑。',
      '禁止把 SW_PUSH 当 SPDT；禁止线圈两端同网；禁止触点与线圈脚混用。',
      'coilVoltage',
      '触点理想通断', 9),
    entry('BUZZER', '蜂鸣器', '有源/无源蜂鸣器负载。',
      '+/− 或 1/2（以库脚为准）',
      '经限流或三极管驱动到 VCC/GND；勿与 LED 共用同一三极管 B 脚。',
      '禁止直接短接电源无驱动。',
      '无',
      '声学负载简化', 5),
    entry('FUSE_1A', '保险丝', '过流保护串联元件。',
      '1/2',
      '串在电源入口：VCC_IN→FUSE→后级。',
      '禁止并联在电源两端。',
      'currentRating≈1A',
      '理想电阻近似', 4),

    // —— 二极管/LED/三极管/MOS ——
    entry('1N4148', '开关二极管', '小信号快速二极管。',
      'A阳极 / K阴极',
      '整流/钳位：A→高电位侧，K→低电位；反向截止。',
      '禁止反接当通路；禁止无限流大电流。',
      'type=signal',
      'SPICE 二极管', 6),
    entry('1N4007', '整流二极管', '工频整流用。',
      'A/K',
      'AC→桥或半波整流；滤波电容在后级。',
      '禁止信号高速开关场景误用为主。',
      'type=rectifier',
      'SPICE 二极管', 6),
    entry('1N5819', '肖特基二极管', '低压降整流/续流。',
      'A/K',
      '开关电源续流或低压整流。',
      '禁止反向高耐压场合硬扛。',
      'Schottky',
      'SPICE 二极管', 6),
    entry('2N2222', 'NPN 三极管', '通用 NPN 开关/放大。',
      'C/B/E',
      '开关：E→GND，C→负载到 VCC，B 经基极电阻受 GPIO/前级驱动；B 只接一路驱动。',
      '禁止 B 脚并联多路互斥负载驱动；禁止 C-E 反接。',
      'beta',
      'Ebers-Moll/开关模型', 8),
    entry('2N2907', 'PNP 三极管', '通用 PNP。',
      'C/B/E',
      '高侧开关：E→VCC，C→负载到 GND，B 下拉导通。',
      '禁止当 NPN 脚序硬套。',
      'beta',
      'PNP 模型', 7),
    entry('2N7000', 'N-MOSFET', '小信号 N 沟道增强型。',
      'D/G/S',
      'S→GND，D→负载到 VCC，G 经电阻驱动；注意 Vgs(th)。',
      '禁止 G 悬空；禁止当 P-MOS 用。',
      'Vth',
      '开关 FET', 7),
    entry('IRF540', '功率 N-MOS', '大电流开关。',
      'D/G/S',
      '同 2N7000 拓扑；感性负载需续流二极管。',
      '禁止无栅极电阻硬驱大容性；禁止漏源短路电源。',
      'Rds(on)',
      '功率开关', 7),

    // —— 运放/555/稳压 ——
    entry('UA741', '单运放', '经典双电源运放。',
      'IN+/IN-/OUT/VCC/VEE（以库脚为准）',
      '同相/反相/跟随/滞回；必须接 VCC+VEE；输入勿超轨。滞回：OUT→Rf→IN+→Rg→GND，SIGNAL_GEN amplitude≥5V（≥2V）。',
      '禁止单电源硬用无偏置；禁止输出短到电源；禁止滞回激励幅度≤|Vth|。',
      'gain',
      'opamp 宏模型', 9),
    entry('LM358', '双运放', '单电源可用双运放。',
      'OUT1/IN-1/IN+1/V-/IN+2/IN-2/OUT2/V+',
      '同相放大、比较、缓冲；可单 5V（V+）；未用运放接跟随或接地防振荡。',
      '禁止输入超轨；未用放大器勿悬空输入。',
      'gain',
      '双运放模型', 9),
    entry('TL082', 'JFET 双运放', '高阻输入双运放，常双电源。',
      'OUT1/IN-1/IN+1/V-/IN+2/IN-2/OUT2/V+',
      '同 LM358 拓扑偏好；注意 V+/V- 供电。',
      '禁止电源反接。',
      'gain',
      'JFET 输入运放', 8),
    entry('LM555', '555 定时器', '无稳态/单稳态多谐振荡。',
      'GND/TRIG/OUT/RESET/CTRL/THRES/DISCH/VCC',
      '无稳态: Ra(VCC—DISCH) Rb(DISCH—THRES≡TRIG) C(THRES/TRIG—GND)；CTRL 旁路 100n；OUT 经 R 驱 LED；RESET 接 VCC。DIP 物理脚序 1..8 对应上列具名，建网只用具名。',
      '禁止 TRIG/THRES 悬空；禁止 DISCH 直接短 VCC 无电阻；禁止用 NE555 等库外 ID；禁止在 net_plan 里写裸数字脚 1..8。',
      'Ra/Rb/C 决定频率',
      '行为/定时模型', 10),
    entry('LM7805', '5V 线性稳压', 'TO-220 三端稳压。',
      '1=IN 2=GND 3=OUT',
      '1←未稳压，3→5V，2→地；1/3 端滤波电容必需。建网 pinId 必须用 1/2/3。',
      '禁止输入输出反接；禁止无散热大压差大电流长时间；禁止把 IN/OUT 当 pinId。',
      'Vout=5V',
      'LDO/线性模型', 8),
    entry('LM7812', '12V 线性稳压', '三端 12V。',
      '1=IN 2=GND 3=OUT',
      '同 7805，脚 3 输出 12V。',
      '同 7805 禁例。',
      'Vout=12V',
      '线性稳压', 8),
    entry('AMS1117_3V3', '3.3V LDO', 'STM32 等常用 3.3V。',
      '1=IN 2=GND 3=OUT',
      '1←5V，3→3.3V，两端滤波；MCU VDD 取自脚 3。',
      '禁止输出灌过大电流无散热考虑；禁止 IN/OUT 当 pinId。',
      'Vout=3.3V',
      'LDO', 8),
    entry('LM2596', '开关降压', 'DC-DC buck。',
      'VIN/OUT/GND/FB/ON',
      'VIN←输入，OUT→负载，GND→地，FB 接反馈分压，ON 使能（可接 VCC）。',
      '禁止 FB 悬空；禁止 VIN/OUT 反接。',
      'Vout 可调',
      '简化开关模型', 8),
    entry('CD4017', '十进制计数器', 'Johnson 计数，LED 流水常用。',
      'CLK/EN/RST/Q0..Q9/CO/VDD/VSS',
      'CLK←时钟，RST 复位，Qn 出经 R 驱 LED；未用输入勿悬空；VDD/VSS 供电。',
      '禁止 CMOS 输入悬空；禁止电源反接。',
      'VDD 与逻辑电平一致',
      '数字行为', 8),
    entry('2764', 'EPROM 8Kx8', '紫外可擦除 ROM，并行地址/数据。',
      'A0..A12/D0..D7/CE/OE/VPP/VCC/GND',
      '地址数据接 MCU 总线；CE/OE 控制读；VPP 按模式接。',
      '禁止总线冲突多驱动。',
      '容量 8K',
      '存储行为简化', 7),
    entry('62256', 'SRAM 32Kx8', '并行静态 RAM。',
      'A0..A14/D0..D7/CE/OE/WE/VCC/GND',
      '读写由 WE/OE 控制；与 MCU 总线相连。',
      '禁止 CE 有效时多驱动数据。',
      '32K',
      'SRAM 模型', 7),
    entry('24C02', 'I2C EEPROM', '2Kbit I2C。',
      'A0/A1/A2/VSS/SDA/SCL/WP/VCC',
      'SDA/SCL 上拉到 VCC；接 MCU I2C（如 PB7/PB6）。',
      '禁止无上拉；禁止地址脚乱接导致冲突。',
      'I2C 地址',
      'I2C 从机简化', 7),
    entry('W25Q64', 'SPI Flash', '64Mbit SPI NOR。',
      'CS/DO/WP/GND/DI/CLK/HOLD/VCC',
      '四线 SPI 接 MCU；CS 低选中。',
      '禁止多从机同 CS。',
      'SPI mode',
      'Flash 简化', 7),
    entry('LCD1602', '字符 LCD', '16x2 HD44780 兼容。',
      'VSS/VDD/V0/RS/RW/E/D0..D7/A/K',
      '4 线：RS/E/D4..D7 接 MCU；V0 对比度；A/K 背光。',
      '禁止数据脚无 MCU 驱动悬空乱闪。',
      '4-bit mode 常用',
      '显示外设', 8),
    entry('OLED_12864', 'OLED 128x64', 'I2C 图形屏。',
      'VCC/GND/SDA/SCL',
      'SDA/SCL 上拉；供电常见 3.3V。',
      '禁止 5V 硬灌若器件仅 3.3V。',
      'I2C addr',
      '显示外设', 8),
    entry('DS18B20', '单总线温度', '1-Wire 温度传感器。',
      'GND/DQ/VDD',
      'DQ 上拉 4.7k 到 VCC；接 MCU 单总线脚；VDD→电源，GND→地。',
      '禁止 DQ 无上拉；禁止与强推挽总线冲突。',
      'parasite/power',
      '1-Wire 简化', 8),
    entry('HALL_SENSOR', '霍尔传感器', '磁场开关型霍尔。',
      'VCC/OUT/GND',
      'OUT 开漏时常需上拉；接 MCU 输入；VCC/GND 供电。',
      '禁止电源反接。',
      '无',
      '数字输出', 6),
    entry('LDR', '光敏电阻', '阻值随光照变化。',
      '1/2',
      '与定值电阻分压：VCC—R—SENSE—LDR—GND；电压表/ADC 测 SENSE。',
      '禁止单独两端直接接电源无分压。',
      'resistance',
      '可变电阻', 7),
    entry('OSCILLOSCOPE', '示波器', '多通道虚拟示波器。',
      'CH1..CH4/GND',
      'CHx 并入被测信号网同名；GND→系统地；禁止另建 PROBE_* 重复列被测脚。',
      '禁止 CH 浮空；禁止仪器脚走长导线（用标号）。',
      '时基/触发在仪器面板',
      '采样显示', 10),
    entry('VIRTUAL_METER', '万用表', '多功能虚拟表。',
      'V/COM',
      '电压模式：V→被测高点，COM→低点或 GND。',
      '禁止当电流表误串电源两端短路。',
      'mode',
      '读数仪器', 9),
    entry('VOLTMETER_DC', '直流电压表', '并联测 DC 电压。',
      'V+/COM',
      'V+→被测高点，COM→低点或 GND；多表测不同节点对。',
      '禁止全表测同一对节点；禁止当电流表串联。',
      '无',
      '高阻并联', 10),
    entry('AMMETER_DC', '直流电流表', '串联测 DC 电流。',
      'I+/I-',
      'VCC→I+，I-→负载；I+/I- 绝不同网。中间网名常用 VCC_AM。',
      '禁止 I+/I- 同网（短路）；禁止并联在电源两端。',
      '无',
      '近零阻串联', 10),
    entry('POWER_METER', '功率表', '同时测 V/I/P。',
      'V+/V-/I+/I-',
      '电压脚并联节点，电流脚串联回路。',
      '禁止接线使电源短路。',
      '无',
      '功率读数', 8),
    entry('FREQ_COUNTER', '频率计', '测信号频率。',
      'IN/GND',
      'IN 并入被测信号网；GND→地。',
      '禁止输入悬空。',
      '无',
      '频率统计', 8),
    entry('LOGIC_ANALYZER', '逻辑分析仪', '多通道数字采样。',
      'CH1..CH8/GND',
      '各 CHx 并入对应数字网；GND→地；用标号。',
      '禁止模拟高压直灌。',
      '采样率面板设置',
      '数字采样', 9),
    entry('UART_TERMINAL', '串口终端', '虚拟 UART TX/RX。',
      'TX/RX/GND',
      '交叉：MCU PA9(TX)→终端 RX，MCU PA10(RX)←终端 TX；GND 共地。',
      '禁止 TX-TX 对顶；电平需与 MCU 一致。',
      'baud',
      '串口收发', 9),

    // —— 电感/晶振（精确） ——
    entry('L_10uH', '电感 10µH', '滤波/储能电感。',
      '1/2',
      '串在电源或 LC 网络；与 C 组成滤波。',
      '禁止两端直接短电源无回路设计。',
      'L=10uH',
      '理想电感', 4),
    entry('XTAL_11M', '晶振 11.0592M', '8051 常用晶振。',
      '1/2',
      '跨接 OSC 两脚；两端各 22pF（或库电容）到 GND；用短导线。',
      '禁止一脚悬空；禁止当电阻用。',
      'freq=11.0592MHz',
      '时钟源', 8),
    entry('XTAL_8M', '晶振 8M', 'STM32 常用晶振。',
      '1/2',
      '接 OSC_IN/OSC_OUT + 负载电容到 GND。',
      '同 XTAL_11M 禁例。',
      'freq=8MHz',
      '时钟源', 8)
  ];
}

/** 族模板：前缀匹配（长前缀优先） */
function buildFamilyTemplates(): FamilyTemplate[] {
  return [
    {
      prefix: 'R_',
      entry: entry('', '电阻', '限流/分压/上拉下拉通用电阻。',
        '1/2 无极性',
        '分压: VCC—R1—SENSE—R2—GND；LED: VCC—R—LED.A，LED.K—GND；上拉: 信号—R—VCC。',
        '禁止两端同网短路；N 路 LED 用 N 颗不同电阻。',
        'value 由 ID 决定（如 R_10k→10k）',
        '理想电阻', 3)
    },
    {
      prefix: 'C_',
      entry: entry('', '电容', '滤波/去耦/定时/耦合。',
        '1/2（电解注意极性若库标注）',
        '去耦: 紧靠 IC VCC—C—GND；定时: 与 R 组成 RC；电源滤波大电解+小瓷片并联。',
        '禁止电解反接；禁止当导线短接电源。',
        'value 由 ID 决定',
        '理想电容', 3)
    },
    {
      prefix: 'POT_',
      entry: entry('', '电位器', '三端可调分压。',
        '1/2=两端，W=抽头',
        '1→VCC，2→GND，W→被调节点/运放输入；或作可变电阻用 1-W。',
        '禁止 W 悬空作端电阻却不接；禁止 1-2 短接电源无限流。',
        'value、wiper(0~1)',
        '分压电阻对', 7)
    },
    {
      prefix: 'LED_',
      entry: entry('', '发光二极管', '指示灯，必须限流。',
        'A阳极 / K阴极',
        'A←经 ≥220Ω 到 VCC 或 GPIO/触点；K→GND；每灯独立电阻。',
        '禁止无电阻直接电源；禁止 K 接 VCC 正向；禁止短路 LED。',
        'color、forwardVoltage',
        'LED 二极管', 7)
    },
    {
      prefix: 'XTAL_',
      entry: entry('', '晶振', '时钟晶体。',
        '1/2',
        '跨 MCU 晶振脚 + 负载电容到地。',
        '禁止悬空单脚。',
        'freq 见 ID',
        '时钟', 7)
    },
    {
      prefix: '74HC',
      entry: entry('', '74HC 逻辑', 'CMOS 逻辑门/触发器族。',
        '按门型号：输入/输出/VCC/GND',
        'VCC 去耦 100n；未用输入接 VCC 或 GND，禁止悬空；输出经电阻驱 LED。',
        '禁止输入悬空；禁止输出短接；电源须在逻辑电平范围。',
        'VCC 常 5V',
        '数字门行为', 8)
    },
    {
      prefix: 'STM32',
      entry: entry('', 'STM32 MCU', 'Cortex-M 最小系统。',
        'VDD/VSS/VDDA/VSSA/NRST/BOOT0/OSC_IN/OSC_OUT + PAx/PBx/PCx…',
        '每 VDD 旁路 100n→GND；NRST 上拉 10k→VCC；BOOT0→GND；晶振接 OSC_IN/OUT；USART1 常用 PA9/PA10。',
        '禁止 VDD 悬空；禁止 BOOT0 乱接导致无法启动；禁止库外脚名。',
        '需烧录对应 hex',
        'MCU 指令仿真', 10)
    },
    {
      prefix: 'AT89',
      entry: entry('', '8051 MCU(AT89)', '经典 8051。',
        'P0.x/P1.x/P2.x/P3.x/ALE/PSEN/EA/RST/XTAL1/XTAL2/VCC/GND',
        'EA→VCC(内部 ROM)；RST 上拉；晶振 XTAL1/XTAL2；P1.x 灌电流驱 LED。',
        '禁止 EA 悬空；禁止 XTAL 悬空。',
        '需烧录 hex',
        '8051 核', 10)
    },
    {
      prefix: 'STC',
      entry: entry('', 'STC 8051', '宏晶增强 8051。',
        '同 AT89：P0..P3/RST/XTAL1/XTAL2/EA/VCC/GND',
        '最小系统同 AT89；注意复位与下载脚差异。',
        '禁止电源反接。',
        '需烧录 hex',
        '8051 兼容核', 10)
    }
  ];
}

const EXACT: DeviceUsageEntry[] = buildExactEntries();
const FAMILIES: FamilyTemplate[] = buildFamilyTemplates();

function cloneWithId(base: DeviceUsageEntry, libDevId: string): DeviceUsageEntry {
  const e: DeviceUsageEntry = {
    libDevId: libDevId,
    title: base.title,
    summary: base.summary,
    pins: base.pins,
    typicalWiring: base.typicalWiring,
    forbidden: base.forbidden,
    params: base.params,
    simNotes: base.simNotes,
    priority: base.priority
  };
  return e;
}

export class DeviceUsageManual {
  /** 解析单器件手册；无精确/族匹配返回 null */
  static resolve(libDevId: string): DeviceUsageEntry | null {
    if (!libDevId || libDevId.length === 0) {
      return null;
    }
    for (let i = 0; i < EXACT.length; i++) {
      if (EXACT[i].libDevId === libDevId) {
        return EXACT[i];
      }
    }
    // 长前缀优先
    let best: FamilyTemplate | null = null;
    for (let i = 0; i < FAMILIES.length; i++) {
      const f = FAMILIES[i];
      if (libDevId.indexOf(f.prefix) === 0) {
        if (!best || f.prefix.length > best.prefix.length) {
          best = f;
        }
      }
    }
    if (best) {
      return cloneWithId(best.entry, libDevId);
    }
    return null;
  }

  /**
   * 解析并允许库 description 兜底（非静默空）
   * missIds 收集未命中手册的 ID；criticalMissIds 为 MCU/IC/仪器等关键缺口
   */
  static resolveWithLibraryFallback(libDevId: string, library: IComponentLibrary | null,
    missIds: string[], criticalMissIds?: string[]): DeviceUsageEntry {
    const hit = DeviceUsageManual.resolve(libDevId);
    if (hit) {
      return hit;
    }
    missIds.push(libDevId);
    if (criticalMissIds && DeviceUsageManual.isCriticalLibId(libDevId)) {
      criticalMissIds.push(libDevId);
    }
    let desc = libDevId;
    let pinStr = '(查库引脚表)';
    if (library) {
      try {
        const r = library.getComponent(libDevId);
        if (r.success && r.data) {
          desc = r.data.description || r.data.name || libDevId;
          const bits: string[] = [];
          for (let pi = 0; pi < r.data.pins.length && pi < 16; pi++) {
            const p = r.data.pins[pi];
            bits.push(`${p.id}:${p.name}`);
          }
          if (bits.length > 0) {
            pinStr = bits.join(', ');
          }
        }
      } catch (_e) {
        // keep defaults
      }
    }
    return entry(libDevId, libDevId, desc, pinStr,
      '按库引脚与电路功能合理建网；电源/地用标号。',
      '禁止编造库外脚名；禁止电源短路。',
      '见 defaultParams',
      '见行为/SPICE 模型',
      2);
  }

  /** 无源族可弱兜底；MCU/IC/仪器/传感器/存储等视为关键 */
  static isCriticalLibId(libDevId: string): boolean {
    const u = (libDevId ?? '').toUpperCase();
    if (u.length === 0) {
      return false;
    }
    if (u === 'VCC' || u === 'GND' || u === 'VEE' || u === 'VAC') {
      return false;
    }
    if (u.startsWith('R_') || u.startsWith('C_') || u.startsWith('L_') ||
      u.startsWith('POT_') || u.startsWith('LED_') || u.startsWith('XTAL_') ||
      u.startsWith('FUSE_')) {
      return false;
    }
    return true;
  }

  static formatEntry(e: DeviceUsageEntry, mode: UsageManualMode): string {
    if (mode === 'compact') {
      return `- ${e.libDevId}(${e.title}): ${e.summary} 脚:${e.pins} | 接法:${e.typicalWiring} | 禁:${e.forbidden}`;
    }
    const lines: string[] = [
      `### ${e.libDevId} — ${e.title}`,
      `用途: ${e.summary}`,
      `真脚: ${e.pins}`,
      `典型接法: ${e.typicalWiring}`,
      `禁例: ${e.forbidden}`,
      `参数: ${e.params}`,
      `仿真: ${e.simNotes}`
    ];
    let text = lines.join('\n');
    if (text.length > MAX_CHARS_PER_DEVICE_FULL) {
      text = text.substring(0, MAX_CHARS_PER_DEVICE_FULL - 1) + '…';
    }
    return text;
  }

  /**
   * 为本次选型 libDevId 列表构建手册块
   * @returns text + miss + uniqueCount
   */
  static buildForLibIds(libDevIds: string[], mode: UsageManualMode,
    library: IComponentLibrary | null): DeviceUsageBuildResult {
    const uniqIds: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < libDevIds.length; i++) {
      const id = libDevIds[i];
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      uniqIds.push(id);
    }
    const miss: string[] = [];
    const criticalMiss: string[] = [];
    const entries: DeviceUsageEntry[] = [];
    for (let i = 0; i < uniqIds.length; i++) {
      entries.push(DeviceUsageManual.resolveWithLibraryFallback(
        uniqIds[i], library, miss, criticalMiss));
    }
    entries.sort((a, b) => b.priority - a.priority);

    const maxBlock = mode === 'compact' ? MAX_CHARS_COMPACT_BLOCK : MAX_CHARS_FULL_BLOCK;
    const parts: string[] = [];
    let chars = 0;
    let included = 0;
    const header = mode === 'compact'
      ? '【本次选型器件使用说明·摘要 — 内心遵守，勿写入回复】'
      : '【本次选型器件使用说明·手册 — 建网必须遵守；勿复述全文到 JSON】';
    parts.push(header);
    chars += header.length;

    for (let i = 0; i < entries.length; i++) {
      const block = DeviceUsageManual.formatEntry(entries[i], mode);
      if (chars + block.length + 2 > maxBlock && included > 0) {
        parts.push(`…(其余 ${entries.length - included} 个器件手册因长度裁剪，优先保留高优先级 IC/MCU/仪器)`);
        break;
      }
      parts.push(block);
      chars += block.length + 2;
      included++;
    }

    const result: DeviceUsageBuildResult = {
      text: parts.join('\n'),
      missIds: miss,
      criticalMissIds: criticalMiss,
      deviceCount: uniqIds.length,
      includedCount: included,
      charCount: chars
    };
    return result;
  }

  /** 精确条目快照（验收用） */
  static getExactEntries(): DeviceUsageEntry[] {
    return EXACT.slice();
  }

  /**
   * 从手册 pins 字段提取应作为 pinId 的主 token。
   * 支持 `1=IN 2=GND`、`GND/TRIG/OUT`；跳过含 `..` 的范围缩写。
   */
  static extractPrimaryPinIdsFromManual(pinsField: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (t: string): void => {
      const bare = (t ?? '').trim();
      if (bare.length === 0 || bare.indexOf('..') >= 0) {
        return;
      }
      if (seen.has(bare.toUpperCase())) {
        return;
      }
      seen.add(bare.toUpperCase());
      out.push(bare);
    };
    // 先去掉中英文括号旁注，避免按空格切开
    let s = pinsField ?? '';
    s = s.replace(/（[^）]*）/g, ' ');
    s = s.replace(/\([^)]*\)/g, ' ');
    const eqRe = /([A-Za-z0-9_.+-]+)\s*=\s*[A-Za-z0-9_.+/-]+/g;
    let m: RegExpExecArray | null = eqRe.exec(s);
    let hadEq = false;
    while (m) {
      hadEq = true;
      push(m[1]);
      m = eqRe.exec(s);
    }
    if (hadEq) {
      return out;
    }
    const parts = s.split(/[\/|,，、\s]+/);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i].trim();
      if (p.length === 0 || p.indexOf('=') >= 0) {
        continue;
      }
      if (p.indexOf('建网') >= 0 || p.indexOf('旁注') >= 0 || p.indexOf('必须') >= 0 ||
        p.indexOf('同序') >= 0 || p.indexOf('DIP') >= 0) {
        continue;
      }
      push(p);
    }
    return out;
  }

  /**
   * 手册精确条目 ↔ 库 pin.id 一致性；返回失败描述（空=通过）
   */
  static auditExactPinsAgainstLibrary(library: IComponentLibrary | null): string[] {
    const failures: string[] = [];
    if (!library) {
      return failures;
    }
    for (let i = 0; i < EXACT.length; i++) {
      const e = EXACT[i];
      const id = e.libDevId;
      if (!id || id.length === 0) {
        continue;
      }
      // 范围缩写条目（A0..A12）不做逐脚扫描
      if ((e.pins ?? '').indexOf('..') >= 0) {
        continue;
      }
      let libIds: string[] = [];
      try {
        const r = library.getComponent(id);
        if (!r.success || !r.data || !r.data.pins || r.data.pins.length === 0) {
          continue;
        }
        for (let pi = 0; pi < r.data.pins.length; pi++) {
          libIds.push((r.data.pins[pi].id ?? '').toUpperCase());
        }
      } catch (_err) {
        continue;
      }
      const tokens = DeviceUsageManual.extractPrimaryPinIdsFromManual(e.pins);
      for (let ti = 0; ti < tokens.length; ti++) {
        const tok = tokens[ti];
        const up = tok.toUpperCase();
        if (libIds.indexOf(up) >= 0) {
          continue;
        }
        // 允许 555/运放/稳压别名（会在 canonicalize 阶段落库 id）
        let aliasOk = false;
        if (id === 'LM555' || id.indexOf('555') >= 0) {
          // 手册已改为具名；若残留数字则视为可规范化
          if (/^[1-8]$/.test(up)) {
            aliasOk = true;
          }
        }
        if (id === 'LM7805' || id === 'LM7812' || id === 'AMS1117_3V3') {
          if (up === 'IN' || up === 'OUT' || up === 'GND' || up === 'VIN' || up === 'VOUT') {
            failures.push(
              `${id} 手册主脚 "${tok}" 不是库 pinId(应为 1/2/3)；请写 1=IN 形式`);
            continue;
          }
        }
        if (!aliasOk) {
          failures.push(
            `${id} 手册脚 "${tok}" 不在库 pin.id [${libIds.slice(0, 10).join(',')}]`);
        }
      }
    }
    return failures;
  }

  /** 全库覆盖：每个 ALL_CATALOG id 都能 resolve（精确或族） */
  static coverageReport(): DeviceUsageCoverageReport {
    const covered: string[] = [];
    const missing: string[] = [];
    for (let i = 0; i < ALL_CATALOG_LIBRARY_IDS.length; i++) {
      const id = ALL_CATALOG_LIBRARY_IDS[i];
      if (DeviceUsageManual.resolve(id)) {
        covered.push(id);
      } else {
        missing.push(id);
      }
    }
    const total = ALL_CATALOG_LIBRARY_IDS.length;
    const percent = total === 0 ? 0 : Math.round(covered.length * 100 / total);
    const report: DeviceUsageCoverageReport = {
      covered: covered,
      missing: missing,
      total: total,
      percent: percent
    };
    return report;
  }
}

export interface DeviceUsageBuildResult {
  text: string;
  missIds: string[];
  /** 无精确/族手册的关键器件（MCU/IC/仪器等），应用方应 soft-HARD */
  criticalMissIds: string[];
  deviceCount: number;
  includedCount: number;
  charCount: number;
}

export interface DeviceUsageCoverageReport {
  covered: string[];
  missing: string[];
  total: number;
  percent: number;
}
