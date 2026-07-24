/**
 * 全库器件/仪器意图片段 — 按 libDevId / 族前缀命中后注入 prompt
 * 与 DeviceUsageManual 对齐：短硬规则，不复述整本手册。
 */
import { CircuitIntent } from '../../algorithms/CircuitIntent';

/** 片段条目：匹配键 + 选型侧 + 建网/edit 侧 */
export interface DevInstrFragEntry {
  /** 精确 libDevId 或族前缀（前缀以 * 结尾，如 R_*） */
  key: string;
  /** 选型/BOM 约束 */
  select: string;
  /** 建网/edit 脚级约束 */
  net: string;
}

function f(key: string, select: string, net: string): DevInstrFragEntry {
  const e: DevInstrFragEntry = { key: key, select: select, net: net };
  return e;
}

/** 全量目录（电源/无源/开关/半导体/运放/555/稳压/逻辑/MCU/存储/显示/传感/仪器） */
export function buildDevInstrCatalog(): DevInstrFragEntry[] {
  return [
    // —— 电源符号 ——
    f('VCC',
      '【VCC】必须写 param_constraint.voltage；数字常用 5V/3.3V，运放双电源正轨常用 12V。',
      '【VCC 网】joinByLabel；所有芯片 VCC/VDD/V+ 与上拉高端并入；禁止与 GND/VEE 同网。'),
    f('GND',
      '【GND】系统地参考，无 voltage。',
      '【GND 网】芯片 GND/VSS、仪器 COM/GND、旁路下端并入；禁止浮空地。'),
    f('VEE',
      '【VEE】双电源负轨；voltage 须与 |VCC| 对称（如 -12V）。',
      '【VEE 网】运放 V-/VEE→VEE；禁止接到 GND；禁止与 VCC 同网。'),
    f('VAC',
      '【VAC】交流正弦源；写明 amplitude/frequency。',
      '【VAC】输出端接负载/整流前端；回线到 GND 或专用 AC 回；禁止当直流 VCC。'),

    // —— 激励/开关/继电器/蜂鸣/保险丝 ——
    f('SIGNAL_GEN',
      '【SIGNAL_GEN】param 须含 waveform/amplitude/frequency/offset/dutyCycle。',
      '【SIGNAL_GEN】OUT→激励网；GND→GND；可用 OSC CH 同网观测；禁止 OUT 短 GND。'),
    f('SW_PUSH',
      '【SW_PUSH】两端子常开；用于电源通断/复位/555 TRIG/线圈驱动。',
      '【SW_PUSH】仅 2 脚；禁止当 SPDT；555 单稳态：一端 TRIG 一端 GND；禁止有 555 时串进 VCC→R→C 冒充定时。'),
    f('RELAY_SPDT',
      '【RELAY_SPDT】线圈+COM/NO/NC；互斥双色必须用本器件。',
      '【RELAY】线圈经 SW 驱动勿直短电源；COM→GND（互斥灯）；NC/NO 分接两路 LED；禁止 SW 冒充三端。'),
    f('BUZZER',
      '【BUZZER】声学负载；经限流或三极管驱动。',
      '【BUZZER】一端驱动源/限流 R，一端 GND；禁止两端直接硬接电源无限流。'),
    f('FUSE_1A',
      '【FUSE】串联过流保护。',
      '【FUSE】串在 VCC→负载路径；禁止并联电源两端。'),

    // —— 二极管/三极管/MOS ——
    f('1N4148',
      '【1N4148】小信号开关二极管；注意阳极/阴极方向。',
      '【二极管】A→阳极 K→阴极；续流时反并感性负载；禁止反接当导线。'),
    f('1N4007',
      '【1N4007】工频整流；注意极性。',
      '【整流】交流→桥/半波：阳极/阴极方向正确；阴极常接滤波电容正极。'),
    f('1N5819',
      '【1N5819】肖特基低压降；续流/整流。',
      '【肖特基】同二极管极性规则；开关电源续流按拓扑接。'),
    f('2N2222',
      '【2N2222 NPN】开关/放大；基极须限流。',
      '【NPN】E→GND(共射开关)；C→负载下端或上拉；B 经 Rb 驱动；【硬】B 只接一路驱动。'),
    f('2N2907',
      '【2N2907 PNP】高侧开关/放大。',
      '【PNP】E→VCC；C→负载；B 经电阻下拉/驱动；注意与 NPN 电源方向相反。'),
    f('2N7000',
      '【2N7000 N-MOS】小信号开关；G 要有确定电平。',
      '【N-MOS】S→GND；D→负载下端；G←驱动(可经电阻)；禁止 G 悬空。'),
    f('IRF540',
      '【IRF540】功率 N-MOS；注意驱动与散热。',
      '【功率 MOS】同 N-MOS 拓扑；感性负载加续流二极管；G 勿悬空。'),

    // —— 运放（普通单运放 vs 单片双运放）——
    f('UA741',
      '【UA741·普通单运放】一片一颗；单级放大/跟随/滞回/积分优先选它；须双电源±12V+VEE；禁套双运放通道脚。',
      '【UA741】真脚 IN+/IN-/OUT/VCC/VEE；VCC→正轨 VEE→负轨；反馈 OUT↔IN- 或滞回正反馈；禁 V+/OUT1 假脚。'),
    f('LM358',
      '【LM358·单片双运放】一片两路共享电源；单电源5V或要两路时选它；与 UA741 脚名完全不同。',
      '【LM358】OUT1/IN±1/OUT2/IN±2/V+/V-；未用半边 IN-↔OUT、IN+→GND；禁按 UA741 五脚连。'),
    f('TL082',
      '【TL082·单片双运放·高阻】双通道 JFET；积分/高阻缓冲+双电源时选；未用半边须跟随。',
      '【TL082】同双运放通道脚铁律；V+→VCC V-→VEE；禁按 UA741 单运放脚名建网。'),

    // —— 555（选型侧短述；脚级以 IntentPromptFragments 无稳态/单稳态为准）——
    f('LM555',
      '【LM555】库 ID 必须 LM555；禁 NE555；按单稳态/无稳态选对拓扑。',
      '【LM555】供电 VCC/GND；RESET→VCC(不用复位)；CTRL—C_100n—GND；OUT 经 R 驱 LED；禁裸脚号 1..8。'),

    // —— 稳压/DC-DC ——
    f('LM7805',
      '【7805】三端 5V；pinId 用 1/2/3 禁写 IN/OUT 当脚名。',
      '【7805】1=IN 2=GND 3=OUT；IN/OUT 加滤波电容到 GND；禁 1≡3；禁 OUT 短 GND。'),
    f('LM7812',
      '【7812】输出 12V；脚序同 7805。',
      '【7812】1←输入 2→GND 3→12V 轨；两端滤波。'),
    f('AMS1117_3V3',
      '【AMS1117】3.3V LDO；脚 1/2/3。',
      '【LDO】1←5V 2→GND 3→3.3V；输入输出电容；禁 OUT 短 GND。'),
    f('LM2596',
      '【LM2596】开关降压；FB 设定电压。',
      '【Buck】VIN/OUT/GND/FB/ON 按库；FB 接反馈分压；禁 FB 悬空；禁 VIN/OUT 反接。'),

    // —— 逻辑/计数 ——
    f('CD4017',
      '【CD4017】十进制计数/流水灯；CLK 需时钟。',
      '【4017】CLK←时钟；Qn—R—LED—GND；RST/EN 按手册；VDD/VSS+去耦。'),
    f('74HC*',
      '【74HC】CMOS 逻辑；电源与不用输入处理。',
      '【74HC】VCC/GND；不用输入拉到合法电平；输出勿短电源；总线注意上拉。'),

    // —— MCU ——
    f('STM32*',
      '【STM32】最小系统：晶振、去耦、复位上拉、BOOT0→GND。',
      '【STM32】VDD→VCC+100n→GND；VSS→GND；NRST→10k→VCC；BOOT0→GND；XTAL+22pF×2。'),
    f('AT89*',
      '【8051】最小系统：晶振、复位、EA→VCC。',
      '【8051】VCC/GND；EA→VCC；RST 复位电路；XTAL+电容。'),
    f('STC*',
      '【STC】增强 8051；同最小系统约束。',
      '【STC】同 8051：供电、复位、晶振；下载脚勿误短。'),

    // —— 存储 ——
    f('2764',
      '【2764 EPROM】地址/数据/控制总线。',
      '【EPROM】VCC/GND；地址数据接 MCU 总线；CE/OE 控制；禁总线冲突。'),
    f('62256',
      '【62256 SRAM】并行存储。',
      '【SRAM】供电+总线；CE/OE/WE；禁多片同时驱动总线。'),
    f('24C02',
      '【24C02 I2C EEPROM】须 I2C 上拉。',
      '【24C02】VCC/GND；SDA/SCL 各 R_4.7k→VCC；WP 按需；禁无上拉。'),
    f('W25Q64',
      '【W25Q64 SPI Flash】SPI 四线。',
      '【SPI Flash】VCC/GND；CS/SCK/MOSI/MISO 接主机；CS 上拉可选。'),

    // —— 显示 ——
    f('LCD1602',
      '【LCD1602】字符液晶；供电+对比度+数据/控制。',
      '【1602】VSS→GND VDD→VCC；VO 对比度分压；RS/E/R/W/D0–D7 或 4 位模式；背光按库。'),
    f('OLED_12864',
      '【OLED】常 I2C；须上拉。',
      '【OLED】VCC/GND；SDA/SCL+上拉；地址脚按模块。'),

    // —— 传感 ——
    f('DS18B20',
      '【DS18B20】1-Wire；DQ 须上拉。',
      '【18B20】VDD/GND；DQ—R_4.7k→VCC；禁 DQ 无上拉。'),
    f('HALL_SENSOR',
      '【霍尔】开漏 OUT 常需上拉。',
      '【霍尔】VCC/GND；OUT 上拉到 VCC 再接 MCU；禁电源反接。'),
    f('LDR',
      '【LDR】光敏；必须分压。',
      '【LDR】与定值 R 组成分压取 SENSE；禁两端直接跨电源无分压。'),

    // —— 仪器 ——
    f('OSCILLOSCOPE',
      '【示波器】CH1–4+GND；至少 CH1+GND。',
      '【OSC】CHx 并入被测信号网同名；GND stubLabel→GND；禁 CH 挂电源轨；禁另建 PROBE_*；禁有 CH 无 GND。'),
    f('VIRTUAL_METER',
      '【万用表】真脚 V,A,OHM,COM；禁写 V+。',
      '【VM】测压 V∥高点 COM→低/GND；测流 A–COM 串联；测阻 OHM–COM；禁 A 当电压探针；禁无 COM。'),
    f('VOLTMETER_DC',
      '【电压表】并联；多表测不同节点对。',
      '【V表】V+/COM 并联被测；禁全部测同一节点对；COM 常回 GND。'),
    f('AMMETER_DC',
      '【电流表】必须串联：VCC→I+→I-→负载。',
      '【A表】I+/I- 绝不同网；禁并联电源；串切入电源回路。'),
    f('POWER_METER',
      '【功率表】V 并 + I 串。',
      '【P表】V+/V- 跨负载；I+/I- 串联；禁 I 路与 V 路完全同节点对。'),
    f('FREQ_COUNTER',
      '【频率计】IN+GND。',
      '【FREQ】IN 并入被测；GND→GND；禁 IN 浮空称已测。'),
    f('LOGIC_ANALYZER',
      '【逻辑分析仪】CH1–CH8+GND；禁 CH0/D0。',
      '【LA】CHx 并入数字网；GND→GND；未用通道可悬空；禁编造 CH0。'),
    f('UART_TERMINAL',
      '【串口终端】TX/RX/GND。',
      '【UART】交叉 TX↔RX；GND 共地；禁 TX-TX 直连。'),

    // —— 无源族 ——
    f('R_*',
      '【电阻】尽量写清 R_1k/R_10k/R_330/R_4.7k 等。',
      '【R】两端无极性；LED 限流/分压/上拉/555 定时按功能接线；禁两端同网短路。'),
    f('C_*',
      '【电容】去耦用 C_100nF；定时/积分按拓扑选值。',
      '【C】去耦：电源—C—GND；555 CTRL 旁路必须 100n；禁电解反接；禁两端同网。'),
    f('L_*',
      '【电感】滤波/储能。',
      '【L】串入电源或 LC 滤波；开关节点按拓扑；禁当导线短接电源。'),
    f('POT_*',
      '【电位器】三端；分压或可变电阻。',
      '【POT】1/2 跨电源或串入，W 抽头取分压；禁悬空抽头当完成。'),
    f('LED_*',
      '【LED/LED灯】口语 LED=LED灯=指示灯，库仅 LED_RED/GREEN/BLUE；禁编造 LED灯 为 libDevId；禁当 OLED。须限流；N 灯 N 电阻。',
      '【LED】A←经 R←驱动；K→GND；禁无电阻直接电源；禁 K 接 VCC 正向硬灌。'),
    f('XTAL_*',
      '【晶振】MCU 时钟；配负载电容。',
      '【XTAL】接 OSC_IN/OSC_OUT；两端各 22pF→GND；走线最短。'),
    f('L_10uH',
      '【L_10uH】滤波/储能电感。',
      '【L_10uH】串电源或 LC；禁两端同网短电源。'),
    f('XTAL_11M',
      '【XTAL_11M】8051 常用晶振。',
      '【XTAL_11M】跨 XTAL1/2 + 负载电容到 GND。'),
    f('XTAL_8M',
      '【XTAL_8M】STM32 常用晶振。',
      '【XTAL_8M】跨 OSC_IN/OUT + 负载电容到 GND。')
  ];
}

let cachedCatalog: DevInstrFragEntry[] | null = null;

function getCatalog(): DevInstrFragEntry[] {
  if (cachedCatalog === null) {
    cachedCatalog = buildDevInstrCatalog();
  }
  return cachedCatalog;
}

function catalogSelectByKey(key: string): string {
  const catalog = getCatalog();
  for (let i = 0; i < catalog.length; i++) {
    if (catalog[i].key === key) {
      return catalog[i].select;
    }
  }
  return '';
}

function matchEntry(libId: string, entry: DevInstrFragEntry): boolean {
  const id = (libId ?? '').toUpperCase();
  const key = (entry.key ?? '').toUpperCase();
  if (id.length === 0 || key.length === 0) {
    return false;
  }
  if (key.endsWith('*')) {
    const prefix = key.substring(0, key.length - 1);
    return id.indexOf(prefix) === 0;
  }
  return id === key;
}

/**
 * 按板上/选型 libDevId 收集片段。
 * stage=select 用 select 字段；net/edit 用 net 字段（edit 两者都可带）。
 */
export function assembleLibIdFragments(libIds: string[], stage: string): string {
  if (!libIds || libIds.length === 0) {
    return '';
  }
  const catalog = getCatalog();
  const seenKeys: string[] = [];
  const parts: string[] = [];
  const hasSeen = (k: string): boolean => {
    for (let si = 0; si < seenKeys.length; si++) {
      if (seenKeys[si] === k) {
        return true;
      }
    }
    return false;
  };
  for (let i = 0; i < libIds.length; i++) {
    const id = (libIds[i] ?? '').trim();
    if (id.length === 0) {
      continue;
    }
    for (let ci = 0; ci < catalog.length; ci++) {
      const e = catalog[ci];
      if (!matchEntry(id, e)) {
        continue;
      }
      if (hasSeen(e.key)) {
        continue;
      }
      seenKeys.push(e.key);
      if (stage === 'select') {
        if (e.select.length > 0) {
          parts.push(e.select);
        }
      } else if (stage === 'net') {
        if (e.net.length > 0) {
          parts.push(e.net);
        }
      } else {
        // edit：选型+建网都给，修接更稳
        if (e.select.length > 0) {
          parts.push(e.select);
        }
        if (e.net.length > 0) {
          parts.push(e.net);
        }
      }
    }
  }
  if (parts.length === 0) {
    return '';
  }
  return `\n【器件/仪器意图片段·按板上型号注入 · ${stage} · ${seenKeys.length}条】\n` + parts.join('\n');
}

/**
 * 用户提示词关键词 → 选型阶段补充族片段（尚无 BOM 时）
 */
export function assemblePromptKeywordFragments(userPrompt: string): string {
  const zh = userPrompt ?? '';
  const lower = zh.toLowerCase();
  const parts: string[] = [];
  if (zh.indexOf('三极管') >= 0 || lower.indexOf('npn') >= 0 || lower.indexOf('pnp') >= 0 ||
    lower.indexOf('2n2222') >= 0) {
    parts.push(catalogSelectByKey('2N2222'));
  }
  if (zh.indexOf('MOS') >= 0 || lower.indexOf('mosfet') >= 0 || lower.indexOf('2n7000') >= 0) {
    parts.push(catalogSelectByKey('2N7000'));
  }
  if (zh.indexOf('二极管') >= 0 || zh.indexOf('整流') >= 0 || lower.indexOf('1n4007') >= 0) {
    parts.push(catalogSelectByKey('1N4007'));
  }
  if (zh.indexOf('稳压') >= 0 || zh.indexOf('7805') >= 0 || lower.indexOf('ldo') >= 0) {
    parts.push(catalogSelectByKey('LM7805'));
  }
  if (zh.indexOf('继电器') >= 0 || lower.indexOf('relay') >= 0) {
    parts.push(catalogSelectByKey('RELAY_SPDT'));
  }
  if (zh.indexOf('蜂鸣') >= 0 || lower.indexOf('buzzer') >= 0) {
    parts.push(catalogSelectByKey('BUZZER'));
  }
  if (zh.indexOf('液晶') >= 0 || lower.indexOf('lcd') >= 0 || lower.indexOf('oled') >= 0) {
    parts.push(catalogSelectByKey('LCD1602'));
  }
  if (zh.indexOf('温度') >= 0 || lower.indexOf('ds18b20') >= 0) {
    parts.push(catalogSelectByKey('DS18B20'));
  }
  if (zh.indexOf('EEPROM') >= 0 || zh.indexOf('闪存') >= 0 || lower.indexOf('24c02') >= 0 ||
    lower.indexOf('w25q') >= 0) {
    parts.push(catalogSelectByKey('24C02'));
  }
  if (zh.indexOf('电位器') >= 0 || lower.indexOf('potentiometer') >= 0) {
    parts.push(catalogSelectByKey('POT_*'));
  }
  if (zh.indexOf('电感') >= 0 || lower.indexOf('inductor') >= 0) {
    parts.push(catalogSelectByKey('L_*'));
  }
  if (zh.indexOf('光敏') >= 0 || lower.indexOf('ldr') >= 0) {
    parts.push(catalogSelectByKey('LDR'));
  }
  if (zh.indexOf('霍尔') >= 0 || lower.indexOf('hall') >= 0) {
    parts.push(catalogSelectByKey('HALL_SENSOR'));
  }
  if (zh.indexOf('4017') >= 0 || zh.indexOf('流水') >= 0) {
    parts.push(catalogSelectByKey('CD4017'));
  }
  if (zh.indexOf('肖特基') >= 0 || lower.indexOf('1n5819') >= 0) {
    parts.push(catalogSelectByKey('1N5819'));
  }
  if (zh.indexOf('PNP') >= 0 || lower.indexOf('2n2907') >= 0) {
    parts.push(catalogSelectByKey('2N2907'));
  }
  if (zh.indexOf('IRF540') >= 0 || zh.indexOf('功率管') >= 0) {
    parts.push(catalogSelectByKey('IRF540'));
  }
  if (zh.indexOf('2596') >= 0 || zh.indexOf('降压') >= 0 || lower.indexOf('buck') >= 0) {
    parts.push(catalogSelectByKey('LM2596'));
  }
  if (zh.indexOf('7812') >= 0) {
    parts.push(catalogSelectByKey('LM7812'));
  }
  if (zh.indexOf('1117') >= 0 || zh.indexOf('3.3V') >= 0 || zh.indexOf('3V3') >= 0) {
    parts.push(catalogSelectByKey('AMS1117_3V3'));
  }
  if (zh.indexOf('EPROM') >= 0 || zh.indexOf('2764') >= 0) {
    parts.push(catalogSelectByKey('2764'));
  }
  if (zh.indexOf('SRAM') >= 0 || zh.indexOf('62256') >= 0) {
    parts.push(catalogSelectByKey('62256'));
  }
  if (zh.indexOf('逻辑分析') >= 0 || lower.indexOf('logic analyzer') >= 0) {
    parts.push(catalogSelectByKey('LOGIC_ANALYZER'));
  }
  if (zh.indexOf('频率计') >= 0 || lower.indexOf('freq') >= 0) {
    parts.push(catalogSelectByKey('FREQ_COUNTER'));
  }
  if (zh.indexOf('功率表') >= 0) {
    parts.push(catalogSelectByKey('POWER_METER'));
  }
  if (zh.indexOf('万用表') >= 0) {
    parts.push(catalogSelectByKey('VIRTUAL_METER'));
  }
  if (zh.indexOf('保险丝') >= 0 || lower.indexOf('fuse') >= 0) {
    parts.push(catalogSelectByKey('FUSE_1A'));
  }
  if (zh.indexOf('交流源') >= 0 || zh.indexOf('市电') >= 0 || lower.indexOf('vac') >= 0) {
    parts.push(catalogSelectByKey('VAC'));
  }
  const cleaned: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && parts[i].length > 0) {
      cleaned.push(parts[i]);
    }
  }
  if (cleaned.length === 0) {
    return '';
  }
  return `\n【器件族关键词片段·选型】\n` + cleaned.join('\n');
}

/**
 * 仪器细分片段（在 hasInstruments 时追加，比总表更细）
 */
export const FRAG_INSTR_DETAIL_SELECT: string = `
【仪器细分选型】:
- 示波器/波形/方波观测 → OSCILLOSCOPE（CH1–4+GND）
- 电流/串联测流 → AMMETER_DC（VCC→I+→I-→负载）
- 电压表/测压 → VOLTMETER_DC（多表不同节点对）
- 万用表/电阻档/二极管档 → VIRTUAL_METER（V/A/OHM/COM）
- 功率 → POWER_METER；频率 → FREQ_COUNTER；逻辑 → LOGIC_ANALYZER(CH1–8)；串口 → UART_TERMINAL
- 信号源/外接正弦/三角激励 → SIGNAL_GEN（写全 param）；【禁】闭环自激振荡勿加 SIGNAL_GEN
- 「观测方波/三角波」只加 OSCILLOSCOPE，不等于要 SIGNAL_GEN`;

export const FRAG_INSTR_DETAIL_NET: string = `
【仪器细分建网】:
- OSC: CHx∥被测网同名；GND stubLabel；禁 PROBE_*；禁 CH 挂 VCC/GND
- AMMETER: I+/I- 异网串联；禁并联
- VOLTMETER: V+/COM 并联；多表分布
- VIRTUAL_METER: 真脚 V,A,OHM,COM；有信号必有 COM
- POWER_METER: V 并 I 串；I 路≠V 路节点对
- LA: 仅 CH1–CH8；禁 CH0/D0；UART: TX↔RX 交叉+GND
- FREQ: IN+GND；SIGNAL_GEN: OUT+GND`;

/** edit 总装：板上 libId 级 + 仪器细分 */
export function assembleEditDeviceInstrumentFragments(
  intent: CircuitIntent, libIds: string[]): string {
  let s = assembleLibIdFragments(libIds, 'edit');
  if (intent.hasInstruments) {
    s += FRAG_INSTR_DETAIL_NET;
  }
  return s;
}

/** 目录条目数（自检/日志） */
export function countDevInstrCatalog(): number {
  return getCatalog().length;
}
