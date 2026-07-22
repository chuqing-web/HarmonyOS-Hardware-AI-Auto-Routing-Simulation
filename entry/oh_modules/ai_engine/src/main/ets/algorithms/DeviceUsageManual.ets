/**
 * 全库器件使用说明手册 — AI 选型后注入 layout/net_plan/route/self_review
 * 每条必须含：
 * - title: 完整称谓（含型号/角色）
 * - summary: 用途与适用场景
 * - pins: 真脚及含义
 * - typicalWiring: 【经典接法】编号列出该器件全部经典拓扑（建网铁律）
 * - forbidden: 【经典禁接】编号列出全部经典错误接法（硬禁）
 * - params / simNotes
 * 与 ALL_CATALOG_LIBRARY_IDS / BuiltinComponents 同步维护
 */
import { IComponentLibrary } from 'component_library';
import { ALL_CATALOG_LIBRARY_IDS } from './LabTemplateRegistry';

export type UsageManualMode = 'full' | 'compact';

export interface DeviceUsageEntry {
  /** 精确 libDevId；空串表示仅族模板 */
  libDevId: string;
  /** 完整称谓（含型号与角色，勿只写两字短名） */
  title: string;
  /** 用途与适用场景 */
  summary: string;
  /** 真脚及含义 */
  pins: string;
  /** 【经典接法】编号列出该器件全部经典拓扑 */
  typicalWiring: string;
  /** 【经典禁接】编号列出全部经典错误接法 */
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

/** 全手册块上限（net_plan/self_review）；选型器件多时按 priority 裁剪 */
const MAX_CHARS_FULL_BLOCK = 20000;
/** 单器件 full 手册上限 — 须容纳全部经典接法+经典禁接 */
const MAX_CHARS_PER_DEVICE_FULL = 2400;
/** layout/route compact 块上限 */
const MAX_CHARS_COMPACT_BLOCK = 9000;

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
    entry('VCC', '正电源轨符号(可调幅值)',
      '原理图正电源符号，表示整板主正电压源；所有芯片 VCC/VDD/V+ 与上拉电阻高端最终并入本网。选型时必须在 param_constraint.voltage 写明幅值，不可空 {}。',
      '1=VCC（电源输出脚，唯一真脚）',
      '①joinByLabel 并入网名 VCC，符号放左侧，多负载用标号扇出勿拉满屏长导线。' +
      '②数字/MCU 轨：voltage=5V 或 3.3V，所有芯片 VCC/VDD 与上拉高端并入。' +
      '③运放双电源正轨：voltage=12V 或 15V，与 VEE 对称配对。' +
      '④稳压后轨：LM7805/AMS1117 OUT 再经标号并入本网供电。',
      '✕1禁止与 GND/VEE 同网（电源短路）。✕2禁止把信号脚误标成 VCC。' +
      '✕3禁止双电源场景写 5V 却配 VEE=-12V。✕4禁止省略 voltage（空 {}）。✕5禁止用 VAC/SIGNAL_GEN 冒充直流 VCC。',
      'voltage：必须填写，如 "5V"|"3.3V"|"12V"',
      '仿真为理想恒压源，一端到 VCC 节点、另一端到 0(GND)', 8),
    entry('VEE', '负电源轨符号(双电源负轨)',
      '运放/双电源模拟电路的负压轨符号；UA741/TL082 等必须同时有 VCC 与 VEE。单电源运放(LM358 等)通常不需要。',
      '1=VEE（负压输出脚）',
      '①joinByLabel 并入网名 VEE；运放 VEE/V- 脚必须入此网。' +
      '②与 |VCC| 对称：VCC=12V→VEE=-12V；VCC=15V→VEE=-15V。' +
      '③双电源运放跟随/放大/滞回/积分时负轨必须存在且入网。',
      '✕1禁止写正电压。✕2禁止与 VCC 同网。✕3禁止有运放双电源意图却省略 VEE。' +
      '✕4禁止 VEE 浮空。✕5禁止用 GND 冒充负轨给 UA741/TL082。',
      'voltage：必须负值，如 "-12V"|"-15V"|"-5V"',
      '仿真为理想负恒压源', 8),
    entry('GND', '系统地参考符号',
      '全电路 0V 参考地；所有芯片 GND/VSS、仪器 COM/GND、旁路电容下端最终并入本网。',
      '1=GND',
      '①joinByLabel 并入网名 GND。②芯片 GND/VSS/VSSA 全部回本网。' +
      '③仪器 COM/GND 必须回 GND（SIM_CONN）。④去耦/旁路电容一端电源一端 GND。' +
      '⑤分压下臂、LED 阴极、发射极/源极低侧开关通常回 GND。',
      '✕1禁止浮空地。✕2禁止把信号网命名为 GND。✕3禁止 VCC 与 GND 同网。' +
      '✕4禁止用 GND 当信号线名乱贴。✕5禁止仪器有信号无地回线。',
      '无幅值参数',
      '仿真 SPICE 节点 0', 8),
    entry('VAC', '交流正弦电压源',
      '工频/实验用交流激励，常配合整流桥、变压器初级、示波器观测。',
      'AC+/AC-（两端跨接回路）',
      '①跨接被测交流回路两端作激励。②半波/桥式整流：后级接二极管与滤波电容到直流。' +
      '③示波器测整流前/后波形：CH 并测点，GND 仍回系统地。④低压实验可降 amplitude。',
      '✕1禁止 AC+/AC- 同网短路。✕2禁止当直流 VCC 用。✕3禁止省略回线只接一端。' +
      '✕4禁止与 GND 单端乱短。',
      'amplitude、frequency（如 220V/50Hz 或低压实验值）',
      '交流理想源', 6),
    entry('SIGNAL_GEN', '函数信号源(正弦/方波/三角/锯齿/脉冲)',
      '可调波形激励源，驱动运放输入、滤波器、滞回比较器等；必须同时接 OUT 与 GND。',
      'OUT=信号输出；GND=系统地回线（以库脚为准）',
      '①OUT 并入被测输入信号网；GND→GND。②驱动同相/反相放大：OUT→Rin→运放输入。' +
      '③滞回/施密特：amplitude 峰值须越过阈值（Rf/Rg≈10:1、±12V 时阈值约 1V），推荐 ≥5V（至少 ≥2V）。' +
      '④方波/脉冲驱动积分器须写 dutyCycle。⑤示波器可并测同一 OUT 网。',
      '✕1禁止 OUT 直接短 VCC/GND。✕2禁止有 OUT 无 GND（SIM_CONN 阻断）。' +
      '✕3禁止滞回场景 amplitude<2V（锁死单轨）。✕4禁止当直流电源轨。✕5禁止省略波形参数乱默认。',
      'waveform(sine|square|triangle|saw|pulse)、amplitude、frequency、offset、dutyCycle',
      '瞬态激励；方波边沿驱动积分器/比较器时注意幅度与偏置', 9),

    // —— 继电器/开关/蜂鸣器 ——
    entry('SW_PUSH', '轻触按键开关(常开瞬时)',
      '两端子常开按键：按下导通、松开断开。用途含：电源通断、继电器线圈驱动、MCU 复位、555 单稳态 TRIG 触发、串联 RC 充电通断。',
      '1/2=两端（无极性）',
      '①电源通断：VCC→SW→负载→GND。②继电器线圈：VCC→SW→RELAY.1，RELAY.2→GND。' +
      '③【555 单稳态 TRIG 触发·硬】一端接 TRIG、另一端接 GND；TRIG 另经 R_10k 上拉到 VCC；按下拉低 TRIG。' +
      '④【串联 RC 充放电·仅无 555】VCC→SW→R→C→GND 作充电通断。' +
      '⑤MCU 按键：一端 GPIO、一端 GND，GPIO 另经上拉到 VCC（或内部上拉）。',
      '✕1禁止当 SPDT/多触点用（互斥双色须用 RELAY_SPDT）。✕2禁止两端同网短路。' +
      '✕3【硬·有 LM555 且单稳态/延时/按键触发】禁止把 SW 串进 VCC→R→C→GND（那是无 555 的充放电拓扑，不是 555 触发）。' +
      '✕4禁止用 SW 冒充继电器触点 COM/NO/NC。✕5禁止一端悬空却声称已接线。',
      '无；默认常开',
      '理想开关：按下近 0Ω，松开开路(极大电阻)', 9),
    entry('RELAY_SPDT', '单刀双掷继电器(线圈+COM/NO/NC)',
      '电磁继电器：线圈通电后触点 COM 从 NC 打到 NO。用于互斥双色指示、切换两路负载；禁止用 SW_PUSH 假装 SPDT。',
      '1/2=线圈两端；COM=公共触点；NO=常开；NC=常闭（以库为准）',
      '①线圈驱动：VCC→SW_PUSH→1，2→GND（或经三极管/MOS 低侧驱动：C/D→1，2→VCC 或对称接法）。' +
      '②【互斥双色 LED】COM→GND；NC—R—绿灯.A，绿灯.K→VCC 或按极性；NO—R—红灯.A；两灯各独立限流电阻。' +
      '③【负载切换】COM→负载公共端；NC/NO 分别接两路电源或两路负载；forceWire 优先线圈驱动网。' +
      '④续流：感性线圈可并联 1N4148/1N4007（K→电源侧）。',
      '✕1禁止 SW_PUSH 冒充 SPDT。✕2禁止线圈两端同网短路。✕3禁止触点脚与线圈脚混用。' +
      '✕4禁止 COM 接 VCC 造成电源经触点无保护短路（除非有意切换电源且有限流）。' +
      '✕5禁止用本器件冒充串联 RC 充放电开关。✕6禁止双灯共用一颗电阻却声称互斥独立。',
      'coilVoltage 常 5V',
      '触点理想通断；线圈简化为电阻负载', 10),
    entry('BUZZER', '蜂鸣器负载(有源/无源简化)',
      '声学指示负载；可由 GPIO/三极管/555 OUT 经限流驱动。',
      '+/− 或 1/2（以库脚为准，注意极性）',
      '①高端驱动：驱动源—R—蜂鸣器+，−→GND。②低侧三极管：E→GND，C→蜂鸣器−，+→VCC；B 经基极电阻。' +
      '③555 OUT 经电阻驱动。④MCU GPIO 经限流或三极管驱动。',
      '✕1禁止无驱动直接短接电源两端。✕2禁止与 LED 抢同一三极管 B 脚多路互斥。' +
      '✕3禁止反接极性依赖发声。✕4禁止与继电器触点脚混淆。',
      '无或 tone',
      '声学负载简化为电阻/受控源', 5),
    entry('FUSE_1A', '保险丝1A(过流串联保护)',
      '过流保护串联元件，串在电源入口限制故障电流。',
      '1/2=两端',
      '①电源入口串联：电源进线→FUSE→后级 VCC 分配。②分支保护：某支路电源→FUSE→该支路负载。',
      '✕1禁止并联跨接 VCC-GND。✕2禁止当导线短接用。✕3禁止放在地回路当装饰。✕4禁止与负载并联。',
      'currentRating≈1A',
      '正常时近 0Ω；过流熔断模型简化', 4),

    // —— 二极管/LED/三极管/MOS ——
    entry('1N4148', '小信号开关二极管(快恢复)',
      '高速小信号二极管，用于钳位、逻辑保护、小电流整流；非大功率工频整流首选。',
      'A=阳极；K=阴极',
      '①正向开关/小整流：A→较高电位，K→较低电位。②信号钳位：K→信号、A→GND（或反向按需求）。' +
      '③逻辑保护/防反接小电流。④继电器/小电感续流（小电流）。⑤与 R/C 组成保护网络。',
      '✕1禁止反接当通路依赖。✕2禁止无限流大电流硬灌。✕3禁止当 1N4007 工频大电流整流主力。' +
      '✕4禁止 A-K 同网短路。',
      'type=signal',
      'SPICE 二极管模型', 6),
    entry('1N4007', '工频整流二极管(1A级)',
      '工频整流/一般整流用，耐压高；适合桥式/半波整流后接滤波电容。',
      'A=阳极；K=阴极',
      '①半波：AC→A，K→滤波电容正极，电容负极→GND。②桥式整流用四管。' +
      '③后级可接稳压 IC(7805 等)。④感性负载续流：与负载并联，K→电源侧、A→开关节点。',
      '✕1禁止当高速小信号开关主器件。✕2禁止反接。✕3禁止忽略峰值反向电压。✕4禁止无滤波硬接数字轨。',
      'type=rectifier',
      'SPICE 整流二极管', 6),
    entry('1N5819', '肖特基二极管(低压降续流/整流)',
      '低压降肖特基，适合开关电源续流、低压整流、防反接。',
      'A/K',
      '①开关电源续流：与感性负载并联，K→电源侧、A→开关节点。②低压整流同 1N4007 但压降更小。' +
      '③电源防反接串在正极。④OR-ing/理想二极管简化。',
      '✕1禁止反向高耐压场合硬扛。✕2禁止反接。✕3禁止当普通信号二极管忽略漏电。✕4禁止 A-K 短路。',
      'Schottky',
      'SPICE 肖特基', 6),
    entry('2N2222', 'NPN三极管(通用开关/放大)',
      '通用 NPN：可作低侧开关驱动 LED/继电器/蜂鸣器，或小信号放大。基极 B 只能接一路驱动。',
      'C=集电极；B=基极；E=发射极',
      '①【低侧开关】E→GND；C→负载低端，负载高端→VCC；B 经基极电阻(R_1k/R_10k)接 GPIO/前级 OUT。' +
      '②【共射放大】分压偏置或固定偏置；Ce 旁路；Rc 负载；信号经耦合电容进 B。' +
      '③驱动继电器线圈：C→线圈到 VCC，线圈并联续流二极管；E→GND。④射极跟随缓冲：OUT 取 E，C→VCC。',
      '✕1禁止 B 脚多驱动源并接互斥。✕2禁止 C-E 反接当通路。✕3禁止无基极电阻硬驱大电流。' +
      '✕4禁止当 PNP 脚序硬套。✕5禁止 B 悬空。✕6禁止 C-E 直接短电源。',
      'beta(放大倍数)',
      'Ebers-Moll/开关模型', 9),
    entry('2N2907', 'PNP三极管(高侧开关/放大)',
      '通用 PNP，常作高侧开关：发射极接 VCC，集电极接下拉负载。',
      'C/B/E',
      '①【高侧开关】E→VCC；C→负载到 GND；B 经电阻下拉/GPIO 拉低导通。' +
      '②【共射放大(PNP)】按 PNP 偏置网络，勿抄 NPN 电源极性。③配合 NPN 推挽/互补输出。',
      '✕1禁止当 NPN 脚序硬套。✕2禁止 B 悬空。✕3禁止无基极电阻。✕4禁止 E-C 直接短电源。' +
      '✕5禁止按 NPN 低侧拓扑硬套电源。',
      'beta',
      'PNP 模型', 7),
    entry('2N7000', 'N沟道增强型MOSFET(小信号开关)',
      '小信号 N-MOS 开关：栅极电压高于阈值导通；适合 GPIO 驱动中小负载。',
      'D=漏极；G=栅极；S=源极',
      '①【低侧开关】S→GND；D→负载到 VCC；G 经栅极电阻接驱动；可加下拉防悬空。' +
      '②逻辑电平开关 LED/小继电器。③电平转换/开漏：D 上拉，S→GND，G←控制。',
      '✕1禁止 G 悬空。✕2禁止当 P-MOS 用。✕3禁止漏源直接短接电源。' +
      '✕4禁止忽略 Vgs(th) 用不足驱动电压。✕5禁止感性负载无续流。',
      'Vth',
      '开关 FET 模型', 7),
    entry('IRF540', '功率N-MOS(大电流开关)',
      '功率 N 沟道 MOSFET，驱动电机/大功率 LED/继电器等；感性负载必须续流二极管。',
      'D/G/S',
      '①【功率低侧开关】S→GND；D→负载到电源；G 串栅极电阻；可加推挽/专用驱动。' +
      '②电机/大功率 LED/大电流继电器：感性负载并联续流二极管。③PWM 调速：G 接 PWM，注意驱动能力。',
      '✕1禁止无栅极电阻硬驱大容性栅极。✕2禁止漏源短路电源。✕3禁止感性负载无续流。' +
      '✕4禁止 G 悬空。✕5禁止用 2N7000 小信号拓扑硬扛大电流无散热考虑。',
      'Rds(on)',
      '功率开关模型', 7),

    // —— 运放/555/稳压 ——
    entry('UA741', '单运放UA741(双电源经典)',
      '单运放宏模型：同相/反相放大、电压跟随、滞回比较。必须双电源 VCC+VEE；库脚为 VCC/VEE，禁止编造 V+/V-。',
      'IN+=同相输入；IN-=反相输入；OUT=输出；VCC=正电源；VEE=负电源',
      '①【双电源供电】VCC→VCC 网，VEE→VEE 网（对称 ±12V/±15V），系统地另有 GND。' +
      '②【电压跟随】OUT↔IN-，信号→IN+。③【反相放大】Vin→Rin→IN-，Rf 跨 OUT↔IN-，IN+→GND。' +
      '④【同相放大】Vin→IN+，Rg：IN-→GND，Rf：OUT↔IN-。' +
      '⑤【滞回比较】OUT→Rf→IN+→Rg→GND，SIGNAL_GEN→IN-；amplitude≥5V(≥2V)。' +
      '⑥【积分器】信号→R→IN-，C 跨 OUT↔IN-，IN+→GND。',
      '✕1禁止单电源硬用无偏置。✕2禁止输出短电源。✕3禁止挂库外假脚 V+/V-。' +
      '✕4禁止滞回激励 ≤|Vth|。✕5禁止开环当完成态（比较器双输入已接除外）。' +
      '✕6禁止用串联 RC 充放电冒充积分。✕7禁止省略 VEE。',
      'gain',
      'opamp 宏模型；注意输出摆幅不到轨', 10),
    entry('LM358', '双运放LM358(可单电源)',
      '双运放，可单 5V 供电；常用于放大、比较、缓冲。未用半边须接跟随或输入接地防振荡。',
      'OUT1/IN-1/IN+1/V-/IN+2/IN-2/OUT2/V+（以库为准）',
      '①【供电】V+→VCC；V- 单电源时常接 GND，双电源时接 VEE。' +
      '②【跟随】OUTn↔IN-n，信号→IN+n。③【反相/同相放大】拓扑同 UA741。' +
      '④【滞回比较】同 UA741 滞回，注意单电源输出摆幅。⑤【积分】信号→R→IN-，C 跨 OUT↔IN-，IN+→GND/偏置。' +
      '⑥【未用半边】IN-↔OUT、IN+→GND（或中点偏置）。',
      '✕1禁止输入超轨。✕2禁止未用放大器输入悬空。✕3禁止电源反接。' +
      '✕4禁止把 V- 当信号脚。✕5禁止两运放输出短接。✕6禁止用 RC 充放电冒充运放积分。',
      'gain',
      '双运放模型', 9),
    entry('TL082', 'JFET双运放TL082(高阻输入)',
      '高输入阻抗双运放，常双电源；适合积分、采样保持、高阻传感器缓冲。',
      'OUT1/IN-1/IN+1/V-/IN+2/IN-2/OUT2/V+',
      '①【双电源】V+→VCC，V-→VEE（偏好 ±12V）。②【跟随/缓冲高阻传感器】OUT↔IN-，信号→IN+。' +
      '③【反相/同相放大】同 UA741。④【滞回】同 UA741。' +
      '⑤【积分经典】信号→R→IN-，C 跨 OUT↔IN-，IN+→GND。⑥未用半边接跟随防振荡。',
      '✕1禁止电源反接。✕2禁止未用半边输入悬空。✕3禁止用 RC 充放电拓扑冒充积分。' +
      '✕4禁止单电源无偏置硬用。✕5禁止输出短电源。✕6禁止省略 VEE。',
      'gain',
      'JFET 输入运放模型', 8),
    entry('LM555', '555定时器LM555(单稳态延时/无稳态多谐)',
      '经典 555：单稳态=按键触发后 OUT 高电平保持约 1.1RC 再变低；无稳态=自激方波振荡。建网必须按用户模式选对，勿混用。库 ID 必须 LM555（禁止 NE555）。',
      'GND/TRIG/OUT/RESET/CTRL/THRES/DISCH/VCC（DIP 物理脚序 1..8 对应上列具名；建网只用具名，禁裸数字 1..8）',
      '①【单稳态延时·硬】R_timing：VCC—DISCH；C_timing：THRES≡DISCH 节点—GND；TRIG 经 R_pull(如 R_10k)上拉到 VCC；' +
      'SW_PUSH：TRIG↔GND（按下拉低触发）；CTRL—C_100n—GND；RESET→VCC；OUT—R_330—LED.A，LED.K—GND。触发后 OUT 高、LED 亮，延时≈1.1RC 后熄灭。' +
      '②【无稳态多谐·硬·脚级配方 — edit/建网必须逐脚对上】' +
      'Ra(较小定时电阻，常 R_1k)：一端 VCC，另一端仅 DISCH；' +
      'Rb(较大定时电阻，常 R_10k)：一端仅 DISCH，另一端 THRES≡TRIG 同网；' +
      'C_timing(常 C_1uF)：一端 THRES/TRIG 同网，另一端 GND；' +
      'CTRL—C_100nF—GND；可选再一颗 C_100nF：VCC—C—GND 去耦；' +
      'RESET→VCC；OUT—R_330—LED.A，LED.K—GND；' +
      '示波器：CH1∥OUT(555_OUT)，GND→GND；教学可 CH2∥THRES/TRIG、CH3∥DISCH、CH4∥CTRL（各并入已有信号网，禁止另建单脚网）。' +
      '③【CTRL 旁路】任何模式 CTRL—C_100nF—GND（稳定阈值）。④【RESET】不用复位时 RESET→VCC；低有效复位可经按键拉低。' +
      '⑤【OUT 驱 LED/蜂鸣器】OUT—限流 R—负载—GND。⑥供电：芯片 VCC→VCC 网，GND→GND。',
      '✕1禁止套用串联 RC(VCC→SW→R→C→GND) 冒充 555 定时（那是无 555 的充放电）。' +
      '✕2禁止 THRES/DISCH 直接贴 GND。✕3禁止 CTRL 旁路接到 TRIG。✕4禁止使用 NE555 等库外 ID。' +
      '✕5禁止单稳态把 THRES≡TRIG（那是无稳态）。✕6禁止 DISCH 无电阻直短 VCC。' +
      '✕7禁止 TRIG/THRES 悬空。✕8禁止 RESET 悬空。✕9禁止用裸数字脚名 1..8 建网。' +
      '✕10【无稳态·硬】禁止 Ra/Rb 角色反接：禁止两颗定时 R 都接到 VCC；禁止 Ra 接到 THRES/TRIG 而跳过 DISCH；' +
      '禁止 Rb 接到 VCC；禁止把 R1(Ra) 与 R2(Rb) 串成 VCC→R1→R2→DISCH 却漏掉「Rb 另一端接 THRES≡TRIG」。' +
      '✕11【无稳态·硬】禁止 RESET 与 DISCH 同网；禁止把 C_VCC 去耦电容一端挂到 THRES/TRIG/DISCH。' +
      '✕12【无稳态·硬】禁止示波器 CH 挂 VCC/GND 当信号；禁止另建 555_DISCH_SENSE 等单脚/错脚网冒充测量。' +
      '✕13【edit·硬】removeNetNames 不得列出仍在 nets 中保留/重建的网名（禁止自相矛盾）。',
      '单稳态延时≈1.1·R·C；无稳态 f≈1.44/((Ra+2Rb)·C)；VCC 常 5V',
      '行为定时模型；TRIG 须能被按键拉低才会触发；OUT 高驱动 LED', 10),
    entry('LM7805', '三端线性稳压7805(输出5V)',
      'TO-220 式三端稳压：未稳压输入→稳定 5V 输出。建网 pinId 必须用 1/2/3，禁止写 IN/OUT 当 pinId。',
      '1=IN(输入)；2=GND；3=OUT(5V)',
      '①基本：1←未稳压直流；3→5V 负载/MCU；2→GND。②输入滤波：1—C—GND。③输出滤波：3—C—GND（如 C_10uF+C_100nF）。' +
      '④多负载：3 经标号扇出到各芯片 VCC。',
      '✕1禁止输入输出反接。✕2禁止把文字 IN/OUT 当作 pinId。✕3禁止无滤波大电流大压差长时间。' +
      '✕4禁止 OUT 短 GND。✕5禁止 1 与 3 同网。',
      'Vout=5V',
      '线性稳压模型', 8),
    entry('LM7812', '三端线性稳压7812(输出12V)',
      '同 7805，输出 12V，常作运放正轨预稳压。',
      '1=IN；2=GND；3=OUT(12V)',
      '①同 7805：1←输入，2→GND，3→12V。②OUT 可为模拟 VCC=12V 来源。③两端滤波电容。④可再配负压轨给运放。',
      '✕1禁止输入输出反接。✕2禁止 IN/OUT 文字当 pinId。✕3禁止 OUT 短 GND。✕4禁止无滤波。✕5禁止 1≡3。',
      'Vout=12V',
      '线性稳压', 8),
    entry('AMS1117_3V3', 'LDO稳压AMS1117(输出3.3V)',
      '低压差 LDO，STM32 等 3.3V 系统常用；输入常 5V。',
      '1=IN；2=GND；3=OUT(3.3V)',
      '①1←5V；3→MCU VDD/3.3V 外设；2→GND。②输入输出各加滤波电容。③pinId 必须用 1/2/3。④多外设由 OUT 标号扇出。',
      '✕1禁止输出过载无散热考虑。✕2禁止 IN/OUT 文字当 pinId。✕3禁止输入低于 3.3V+压差。' +
      '✕4禁止 OUT 短 GND。✕5禁止给仅 5V 器件当 5V 源。',
      'Vout=3.3V',
      'LDO 模型', 8),
    entry('LM2596', '开关降压DC-DC(LM2596 buck)',
      '开关型降压模块/IC：高效把高压转到低压大电流。',
      'VIN/OUT/GND/FB/ON（以库为准）',
      '①VIN←输入；OUT→负载；GND→地。②FB 接反馈分压设定电压。③ON 使能可接 VCC。④输入输出加电容，电感按模块拓扑。',
      '✕1禁止 FB 悬空。✕2禁止 VIN/OUT 反接。✕3禁止把开关节点当随意 GPIO。✕4禁止无输入电容硬上电。✕5禁止 OUT 短 GND。',
      'Vout 可调(反馈)',
      '简化开关模型', 8),
    entry('CD4017', '十进制计数器CD4017(流水灯常用)',
      'Johnson 计数器：时钟上升沿推进 Q0..Q9；LED 流水灯经典核心。',
      'CLK/EN/RST/Q0..Q9/CO/VDD/VSS',
      '①CLK←时钟(555 无稳态/MCU)。②Qn 经独立 R 驱 LED 到 GND。③RST 复位；EN 使能按手册。④VDD/VSS 供电+去耦。⑤CO 可级联。',
      '✕1禁止 CMOS 输入悬空。✕2禁止电源反接。✕3禁止 Q 输出无电阻直驱大电流 LED。✕4禁止时钟与复位脚对调乱用。',
      'VDD 与逻辑电平一致(常 5V~15V 视器件)',
      '数字行为模型', 8),
    entry('2764', 'EPROM 2764(8Kx8紫外擦除)',
      '并行 EPROM：地址/数据总线接 MCU；CE/OE 控制读取。',
      'A0..A12/D0..D7/CE/OE/VPP/VCC/GND',
      '①地址线接 MCU 地址总线。②数据线接数据总线。③CE/OE 控制读。④VPP 按编程/读模式接。⑤VCC/GND 供电。',
      '✕1禁止总线多驱动冲突。✕2禁止 CE 有效时多片抢数据。✕3禁止地址/数据脚悬空乱读。✕4禁止电源反接。',
      '容量 8K',
      '存储行为简化', 7),
    entry('62256', 'SRAM 62256(32Kx8并行)',
      '并行静态 RAM，读写由 WE/OE/CE 控制。',
      'A0..A14/D0..D7/CE/OE/WE/VCC/GND',
      '①与 MCU 地址数据总线相连。②读：OE 有效；写：WE 有效。③CE 片选。④VCC/GND 供电去耦。',
      '✕1禁止 CE 有效时多驱动数据总线。✕2禁止 WE/OE 时序冲突。✕3禁止电源反接。✕4禁止地址总线浮空读写。',
      '32K',
      'SRAM 模型', 7),
    entry('24C02', 'I2C EEPROM 24C02(2Kbit)',
      'I2C 串行 EEPROM；SDA/SCL 必须上拉。',
      'A0/A1/A2/VSS/SDA/SCL/WP/VCC',
      '①SDA/SCL 各经 R_4.7k 上拉到 VCC。②接 MCU I2C（如 STM32 PB7/PB6）。③A0..A2 设地址。④WP 写保护。⑤VCC/VSS 供电。',
      '✕1禁止无上拉。✕2禁止地址脚乱接导致从机冲突。✕3禁止 5V/3.3V 电平冲突无处理。✕4禁止 SDA/SCL 对调当完成态。',
      'I2C 从机地址',
      'I2C 从机简化', 8),
    entry('W25Q64', 'SPI Flash W25Q64(64Mbit)',
      'SPI NOR Flash；四线 SPI + CS。',
      'CS/DO/WP/GND/DI/CLK/HOLD/VCC',
      '①CS/CLK/DI/DO 接 MCU SPI。②CS 低选中。③多从机必须不同 CS。④WP/HOLD 按手册接高或控制。⑤VCC/GND 供电。',
      '✕1禁止多从机共用同一 CS。✕2禁止电源反接。✕3禁止 DI/DO 对顶。✕4禁止 CS 悬空。',
      'SPI mode',
      'Flash 简化', 7),
    entry('LCD1602', '字符液晶LCD1602(16x2 HD44780)',
      '字符型 LCD；常用 4 位模式：RS/E/D4..D7。',
      'VSS/VDD/V0/RS/RW/E/D0..D7/A/K',
      '①4 线：RS/E/D4..D7→MCU。②RW 常接 GND(只写)。③V0 对比度分压。④A/K 背光经电阻。⑤VDD/VSS 供电。',
      '✕1禁止数据脚无 MCU 驱动悬空乱闪。✕2禁止背光无限流。✕3禁止电源反接。✕4禁止把 RW 当随意 GPIO 悬空。',
      '4-bit mode 常用',
      '显示外设行为', 8),
    entry('OLED_12864', 'OLED 128x64(I2C图形屏)',
      'I2C 图形 OLED；供电常见 3.3V；SDA/SCL 上拉。',
      'VCC/GND/SDA/SCL',
      '①SDA/SCL 上拉到逻辑电源。②接 MCU I2C。③注意 3.3V/5V 兼容。④VCC/GND 供电。',
      '✕1禁止对仅 3.3V 器件硬灌 5V。✕2禁止无上拉。✕3禁止 SDA/SCL 对调当完成。✕4禁止电源反接。',
      'I2C addr',
      '显示外设', 8),
    entry('DS18B20', 'DS18B20单总线温度传感器',
      '1-Wire 数字温度传感器；DQ 必须上拉。',
      'GND/DQ/VDD',
      '①DQ 经 R_4.7k 上拉到 VCC。②DQ→MCU 单总线脚。③VDD→电源；GND→地。④寄生供电模式按手册。',
      '✕1禁止 DQ 无上拉。✕2禁止与强推挽总线冲突。✕3禁止电源反接。✕4禁止 DQ 直接短 VCC。',
      'temp_c 可调；parasite/power',
      '1-Wire 简化；可拖滑条调温', 8),
    entry('HALL_SENSOR', '霍尔开关传感器',
      '磁场接近开关型霍尔；OUT 常开漏需上拉。',
      'VCC/OUT/GND',
      '①VCC/GND 供电。②OUT 开漏时经电阻上拉到 VCC 再接 MCU 输入。③可用示波器/逻辑分析仪观测 OUT。',
      '✕1禁止电源反接。✕2禁止 OUT 无上拉当推挽误用。✕3禁止 OUT 短 GND 当完成。✕4禁止 VCC/OUT 对调。',
      '无',
      '数字输出', 6),
    entry('LDR', '光敏电阻(分压传感)',
      '阻值随光照变化；必须与定值电阻组成分压，不可单独跨电源。',
      '1/2 无极性',
      '①分压：VCC—R_fixed—SENSE—LDR—GND。②对调：VCC—LDR—SENSE—R—GND。③电压表/ADC/运放测 SENSE 网。④可加滤波电容。',
      '✕1禁止两端直接接电源无分压。✕2禁止当普通固定电阻忽略光变。✕3禁止两端同网短路。✕4禁止无测量节点却声称测光。',
      'resistance 随光',
      '可变电阻模型', 7),

    // —— 仪器 ——
    entry('OSCILLOSCOPE', '虚拟示波器(CH1-CH4+GND)',
      '多通道波形观测仪器；至少 CH1+GND 入网；探针一律 joinByLabel/stubLabel，禁止仪器脚跨板长导线。',
      'CH1/CH2/CH3/CH4/GND',
      '①CH1 并入被测信号网同名标号；GND→系统地(优先 stubLabel)。②双踪：CH1/CH2 分测两点+公共 GND。' +
      '③教学全套可接满四通道。④【555 无稳态·硬】CH1∥OUT(555_OUT)；可选 CH2∥THRES/TRIG、CH3∥DISCH、CH4∥CTRL（并入已有网）；' +
      '禁止 CH 与去耦电容另组无 DUT 的 *_SENSE 网。⑤测运放 OUT/信号源：CHx∥该网。⑥一般未用 CH2/3/4 保持悬空。',
      '✕1禁止 CH 浮空当唯一完成态却声称已测量。✕2禁止 CH 挂 VCC/GND 电源轨当信号。' +
      '✕3禁止 CH 与 GND 同网。✕4禁止未用通道接到 GND/NC/另建单脚网。✕5禁止仪器脚走满屏长线。' +
      '✕6禁止另建 PROBE_* 重复列被测脚。✕7禁止有 CH 无 GND（SIM_CONN）。' +
      '✕8【555】禁止用 CH+C_decouple 冒充测量而漏接 OUT。',
      '时基/触发在仪器面板',
      '采样显示；SIM_CONN 有信号必有 GND', 10),
    entry('VIRTUAL_METER', '虚拟万用表(四端V/A/OHM/COM)',
      '多功能表：电压/电流/电阻/二极管档。真脚仅 V,A,OHM,COM，禁止写 V+。',
      'V=电压输入；A=电流输入；OHM=电阻/二极管；COM=公共回线',
      '①测压(DCV/ACV)：V∥被测高点，COM→低点或 GND。②测流(AMP)：A 与 COM 串联切入回路。' +
      '③测阻/二极管：OHM—COM 跨被测。④COM 最终→GND。⑤档位选 DCV/ACV/OHM/AMP/DIODE。',
      '✕1禁止把 A 当电压探针并联。✕2禁止 OHM 跨电源网。✕3禁止 COM 浮空。' +
      '✕4禁止当电流表误把电源两端直接短路。✕5禁止写假脚 V+。✕6禁止有 V/A/OHM 无 COM（SIM_CONN）。',
      'modes: DCV,ACV,OHM,AMP,DIODE',
      '读数仪器；SIM_CONN 需 COM/GND', 10),
    entry('VOLTMETER_DC', '直流电压表(并联测压)',
      '高阻并联电压表；多表必须分布在不同测量节点对。',
      'V+=正极；COM=公共/负极',
      '①V+→被测高电位节点；COM→低电位或 GND。②分压链：多表测不同节点对。③用标号连接。④测稳压 OUT 对地。',
      '✕1禁止全部电压表测同一节点对。✕2禁止当电流表串联。✕3禁止 V+/COM 同网。' +
      '✕4禁止 COM 浮空。✕5禁止跨电源当电流表短路。',
      '无',
      '高阻并联；几乎不取电流', 10),
    entry('AMMETER_DC', '直流电流表(串联测流)',
      '近零阻串联电流表；必须串在电源与负载之间，I+/I- 绝不同网。',
      'I+=电流流入；I-=电流流出',
      '①铁律：VCC→I+→I-→负载→GND；中间网名常用 VCC_AM。②支路测流：串入该支路。③多表测不同支路。',
      '✕1禁止 I+/I- 同网(短路)。✕2禁止并联跨 VCC-GND。✕3禁止与电压表接法混淆。' +
      '✕4禁止当电压表并联。✕5禁止省略负载直接 VCC→表→GND 故意短路。',
      '无',
      '近零阻串联取样', 10),
    entry('POWER_METER', '功率表(V并+I串四端)',
      '同时测电压/电流/功率；电压脚并联、电流脚串联，且 I 路节点对 ≠ V 路节点对。',
      'V+/V-=电压；I+/I-=电流',
      '①V+/V- 跨负载两端。②I+/I- 串联切入供电回路。③同时读 P=V·I。④有信号须有回线。',
      '✕1禁止接线造成电源短路。✕2禁止 I 与 V 完全同节点对。✕3禁止电流脚并联跨电源。' +
      '✕4禁止电压脚串联。✕5禁止回线浮空。',
      'range',
      '功率读数', 9),
    entry('FREQ_COUNTER', '频率计(IN+GND)',
      '测量信号频率；IN 并被测网，GND 回系统地。',
      'IN/GND',
      '①IN 并入被测信号网同名。②GND→GND。③测 555 OUT/信号源/MCU 时钟等。④可用标号。',
      '✕1禁止 IN 悬空。✕2禁止无 GND 回线（SIM_CONN）。✕3禁止 IN 挂电源轨当信号。✕4禁止 IN 与 GND 同网。',
      'gateTime/range',
      '频率统计', 8),
    entry('LOGIC_ANALYZER', '逻辑分析仪(CH1-CH8+GND)',
      '多通道数字采样；禁止 CH0/D0 等假脚名。',
      'CH1..CH8/GND',
      '①各 CHx 并入对应数字网。②GND→地。③标号优先。④可同时采多路 GPIO/UART/SPI。',
      '✕1禁止编造 CH0/D0。✕2禁止模拟高压直灌。✕3禁止无 GND。✕4禁止未用通道乱接电源。✕5禁止仪器长导线满屏。',
      'channels/sampleRate',
      '数字采样', 9),
    entry('UART_TERMINAL', '虚拟串口终端(TX/RX/GND)',
      '与 MCU UART 交叉互连的虚拟终端。',
      'TX/RX/GND',
      '①交叉：MCU TX→终端 RX，MCU RX←终端 TX。②GND 共地。③STM32 常用 PA9/PA10。④设置匹配 baud。',
      '✕1禁止 TX-TX 对顶。✕2禁止电平不匹配硬连。✕3禁止无 GND。✕4禁止 RX-RX 对顶。✕5禁止把 TX 当电源脚。',
      'baud',
      '串口收发', 9),

    // —— 电感/晶振（精确） ——
    entry('L_10uH', '电感10µH(滤波/储能)',
      '功率/滤波电感；与电容组成 LC，或开关电源储能。',
      '1/2',
      '①串在电源入口与负载之间滤波。②与 C 组成 LC 低通。③开关电源储能串在开关节点。④降噪串模扼流简化。',
      '✕1禁止两端直接短接电源无设计。✕2禁止当导线。✕3禁止两端同网。✕4禁止当电阻限流主力。',
      'L=10uH',
      '理想电感', 4),
    entry('XTAL_11M', '晶振11.0592MHz(8051常用)',
      '无源晶振，8051 波特率友好频率。',
      '1/2',
      '①跨接 MCU XTAL1/XTAL2(或 OSC)。②两端各接负载电容(常 22pF)到 GND。③走线最短。④配合 AT89/STC 最小系统。',
      '✕1禁止一脚悬空。✕2禁止当电阻/电容乱用。✕3禁止两端同网。✕4禁止无负载电容却声称完整时钟。',
      'freq=11.0592MHz',
      '时钟源', 8),
    entry('XTAL_8M', '晶振8MHz(STM32常用)',
      '无源晶振，STM32 等外部高速时钟常用。',
      '1/2',
      '①接 OSC_IN/OSC_OUT。②两端各一负载电容到 GND。③短导线。④配合 STM32 最小系统。',
      '✕1禁止一脚悬空。✕2禁止当 R/C 乱用。✕3禁止两端同网。✕4禁止接到普通 GPIO 当完成态。',
      'freq=8MHz',
      '时钟源', 8)
  ];
}

/** 族模板：前缀匹配（长前缀优先） */
function buildFamilyTemplates(): FamilyTemplate[] {
  return [
    {
      prefix: 'R_',
      entry: entry('', '电阻(限流/分压/上拉下拉/定时)',
        '通用无源电阻。按功能：LED 限流(≥220Ω 优先 R_330)、分压、I2C/复位/TRIG 上拉、555 定时电阻。explicitModel 尽量写清阻值 ID(R_1k/R_10k/R_4.7k)。',
        '1/2=两端（无极性）',
        '①分压：VCC—R1—SENSE—R2—GND。②LED 限流：驱动源—R—LED.A，LED.K—GND（N 灯 N 电阻）。' +
        '③上拉：信号网—R—VCC；下拉：信号网—R—GND。' +
        '④【555 无稳态定时·硬】Ra(常 R_1k)：VCC—DISCH（仅这两端）；Rb(常 R_10k)：DISCH—THRES≡TRIG（仅这两端）；' +
        '禁止两颗定时 R 都接 VCC；禁止 Ra 直通 THRES 而绕过 DISCH。' +
        '⑤【555 单稳态】定时 R：VCC—DISCH；TRIG 上拉：VCC—R—TRIG。' +
        '⑥【串联 RC 充放电·仅无 555】VCC—(SW)—R—RC_MID—C—GND。⑦I2C：SDA/SCL 各 R_4.7k 上拉。⑧运放 Rin/Rf/Rg 网络。',
        '✕1禁止两端同网短路。✕2 N 路 LED 禁止共用一颗电阻却声称独立。' +
        '✕3【硬·有 LM555】禁止把定时/上拉电阻改接到 VCC→SW→R→C→GND 串联 RC。' +
        '✕4禁止当导线 0Ω 短电源。✕5禁止用电阻冒充电容/电感。' +
        '✕6【无稳态·硬】禁止把 Ra 与 Rb 都接到 VCC；禁止 Rb 高端接 VCC。',
        'value 由 libDevId 决定(R_10k→10kΩ)',
        '理想电阻', 5)
    },
    {
      prefix: 'C_',
      entry: entry('', '电容(去耦/滤波/定时/旁路)',
        '滤波去耦、555 定时、CTRL 旁路、耦合。电解注意极性；瓷片常 C_100nF 作旁路。',
        '1/2（电解若库标注极性则遵守）',
        '①去耦：紧靠 IC 电源脚—C—GND。②电源入口：大电解+小瓷片并联到 GND。' +
        '③【555 无稳态定时 C·硬】一端仅 THRES≡TRIG 同网，另一端 GND；禁止接到 DISCH 单独成网却漏 THRES。' +
        '④【555 CTRL 旁路】必须 C_100nF：CTRL—C—GND（禁止接到 TRIG/THRES/DISCH）。' +
        '⑤【555 VCC 去耦】可选第二颗 C_100nF：VCC—C—GND（禁止一端挂信号网冒充测量）。' +
        '⑥【无 555 串联 RC 充放电】VCC→SW→R→RC_MID→C→GND。⑦运放积分反馈 C：跨 OUT↔IN-。⑧耦合电容串入交流通路。',
        '✕1禁止电解反接。✕2禁止当导线短接电源。✕3【硬·有 LM555】禁止定时 C 两端都接 GND。' +
        '✕4禁止 CTRL 旁路接到 TRIG。✕5禁止把 555 定时 C 改成串联 RC 充放电拓扑。✕6禁止两端同网。' +
        '✕7【无稳态·硬】禁止 VCC 去耦电容与示波器 CH 组成无 DUT 的单脚/错脚测量网。',
        'value 由 ID 决定(C_100uF/C_100nF/…)',
        '理想电容', 5)
    },
    {
      prefix: 'POT_',
      entry: entry('', '电位器(三端可调分压)',
        '三端可变电阻：两端跨电源，抽头 W 取分压；也可 1-W 作可变电阻。',
        '1/2=两端；W=抽头(wiper)',
        '①分压：1→VCC，2→GND，W→运放输入/被调节点/示波器。②可变电阻：用 1-W 或 2-W 串入回路。' +
        '③调增益：作 Rf 或 Rg 可调。④调对比度/偏置：W 取分压中点。',
        '✕1禁止 W 悬空却当端电阻。✕2禁止 1-2 直接短接电源无限流。✕3禁止只用两端忽略 W 却声称可调。' +
        '✕4禁止三端全部同网。',
        'value、wiper(0~1)',
        '分压电阻对模型', 8)
    },
    {
      prefix: 'LED_',
      entry: entry('', '发光二极管LED(必须限流)',
        '指示灯；阳极经独立限流电阻，阴极到 GND 或合法灌电流节点。N 灯 N 电阻。',
        'A=阳极；K=阴极',
        '①基本：A←经 ≥220Ω(优先 R_330) 到 VCC/GPIO/555.OUT；K→GND。②低侧三极管/MOS 灌电流：K→C/D，A←VCC 经 R。' +
        '③【互斥双色】各灯独立 R，经 RELAY NC/NO，COM→GND。④CD4017 流水：Qn—R—LED—GND。',
        '✕1禁止无电阻直接接电源。✕2禁止 K 接 VCC 正向硬灌。✕3禁止多灯共用一颗电阻却声称独立。' +
        '✕4禁止短路 LED。✕5禁止用 SW_PUSH 当 SPDT 切换双色。✕6禁止反接依赖发光。',
        'color、forwardVoltage',
        'LED 二极管；亮灭看正向电流', 8)
    },
    {
      prefix: 'L_',
      entry: entry('', '电感(滤波/储能)',
        'LC 滤波或开关电源储能电感。',
        '1/2',
        '①串在电源或开关节点滤波。②与电容组成 LC 低通。③开关电源储能。④与续流二极管配合 buck/boost 简化。',
        '✕1禁止两端直接短电源无设计。✕2禁止当导线。✕3禁止两端同网。✕4禁止当限流电阻主力。',
        'L 值见 ID',
        '理想电感', 4)
    },
    {
      prefix: 'XTAL_',
      entry: entry('', '无源晶振(MCU时钟)',
        '跨接 MCU 晶振脚，配合负载电容到地。',
        '1/2',
        '①跨 OSC_IN/OSC_OUT 或 XTAL1/XTAL2。②两端各一负载电容到 GND。③走线最短。④按 MCU 选 8M/11.0592M 等。',
        '✕1禁止单脚悬空。✕2禁止当 R/C 乱用。✕3禁止两端同网。✕4禁止接到普通 GPIO。',
        'freq 见 ID',
        '时钟源', 8)
    },
    {
      prefix: '74HC',
      entry: entry('', '74HC系列CMOS逻辑',
        'CMOS 逻辑门/触发器族；电源去耦，未用输入禁止悬空。',
        '按门型号：输入/输出/VCC/GND',
        '①VCC 旁路 100n→GND。②按真值表接输入输出。③未用输入接 VCC 或 GND。④输出经电阻驱 LED。⑤级联组合逻辑。',
        '✕1禁止输入悬空。✕2禁止输出短接。✕3禁止电源超出逻辑电平范围。✕4禁止输出直接短电源。✕5禁止电源反接。',
        'VCC 常 5V',
        '数字门行为', 8)
    },
    {
      prefix: 'STM32',
      entry: entry('', 'STM32 MCU(Cortex-M最小系统)',
        'ARM Cortex-M 单片机。最小系统：电源去耦、复位上拉、BOOT0、可选外部晶振；外设按引脚表。',
        'VDD/VSS/VDDA/VSSA/NRST/BOOT0/OSC_IN/OSC_OUT + PAx/PBx/PCx…（以库为准）',
        '①每 VDD 旁路 C_100n→GND；VDDA/VSSA 模拟供电。②NRST—R_10k—VCC（可加按键到 GND 复位）。' +
        '③BOOT0→GND(用户程序)。④晶振 OSC_IN/OUT+负载电容。⑤USART1：PA9(TX)/PA10(RX) 交叉接终端。' +
        '⑥GPIO 驱 LED 须限流电阻；I2C 须上拉。',
        '✕1禁止 VDD 悬空。✕2禁止 BOOT0 乱接导致无法启动。✕3禁止编造库外脚名。' +
        '✕4禁止 GPIO 无电阻直连电源灌大电流。✕5禁止 TX-TX 对顶。✕6禁止电源反接。',
        '需烧录对应固件/hex',
        'MCU 指令级仿真', 10)
    },
    {
      prefix: 'AT89',
      entry: entry('', '8051 MCU(AT89系列)',
        '经典 8051 核；内部 ROM 时 EA 接 VCC；晶振+复位必需。',
        'P0.x/P1.x/P2.x/P3.x/ALE/PSEN/EA/RST/XTAL1/XTAL2/VCC/GND',
        '①EA→VCC(内部 ROM)。②RST 经电阻上拉/复位电路（可加按键）。③晶振 XTAL1/XTAL2+电容到 GND。' +
        '④P1 等可灌电流驱 LED(经电阻)。⑤串口按型号接 TXD/RXD。⑥VCC/GND 供电去耦。',
        '✕1禁止 EA 悬空。✕2禁止 XTAL 悬空。✕3禁止电源反接。✕4禁止编造库外脚名。✕5禁止无电阻直驱大电流。',
        '需烧录 hex',
        '8051 核仿真', 10)
    },
    {
      prefix: 'STC',
      entry: entry('', 'STC增强型8051',
        '宏晶 STC 系列，兼容 8051 指令；注意复位与下载脚差异。',
        '同 AT89：P0..P3/RST/XTAL1/XTAL2/EA/VCC/GND（以具体型号库为准）',
        '①最小系统同 AT89：电源去耦、复位、晶振+负载电容。②按具体型号接下载电路。③GPIO 驱 LED 须限流。④串口交叉接终端。',
        '✕1禁止电源反接。✕2禁止关键脚悬空。✕3禁止编造库外脚名。✕4禁止无电阻直驱大电流。✕5禁止 XTAL 单脚悬空。',
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
    return entry(libDevId, `${libDevId}(库描述兜底·请补精确手册)`,
      `${desc}。本条无精确/族手册，建网须严格按库引脚表，禁止编造脚名。`,
      pinStr,
      '①按库引脚与用户功能建网：电源脚→VCC/VEE，地→GND，信号脚入功能网。②优先 joinByLabel。③仪器探针标号连接且须有 GND/COM。',
      '✕1禁止编造库外脚名。✕2禁止电源短路。✕3禁止把本兜底条目当成完整拓扑配方。',
      '见器件 defaultParams',
      '见行为/SPICE 模型；关键 IC 应补 DeviceUsageManual 精确条目',
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
      return `- ${e.libDevId}(${e.title}): ${e.summary}` +
        ` 脚:${e.pins} | 【经典接法】${e.typicalWiring} | 【经典禁接】${e.forbidden}`;
    }
    const lines: string[] = [
      `### ${e.libDevId} — ${e.title}`,
      `用途: ${e.summary}`,
      `真脚: ${e.pins}`,
      `【经典接法】: ${e.typicalWiring}`,
      `【经典禁接】: ${e.forbidden}`,
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
