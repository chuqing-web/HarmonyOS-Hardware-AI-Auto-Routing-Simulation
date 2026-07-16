import type { IComponentLibrary } from 'component_library';
import type { SchTopology, DeviceInst } from 'common';
import type { PromptVarEntry } from '../internal/AiEngineTypes';
import { applyPromptVars } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/internal/AiEngineHelpers";
import { TemplateSchematicKit } from "@bundle:com.elecdraw.aischsim/entry@ai_engine/ets/algorithms/TemplateSchematicKit";
export interface PromptTemplate {
    id: string;
    version: string;
    system: string;
    userTemplate: string;
}
interface ClusterInfo {
    devices: DeviceInst[];
    cx: number;
    cy: number;
    radius: number;
}
interface PinHotspot {
    cellX: number;
    cellY: number;
    pinCount: number;
    estWireCount: number;
    devices: string[];
}
// ---- 基础模板 v3.0 — 拓扑铁律注入 ----
const DEVICE_SELECT_DEFAULT: PromptTemplate = {
    id: 'device_select_v3',
    version: '3.0.0',
    system: `你是资深硬件工程师。根据用户需求拆解电路功能模块与器件需求。

【核心拓扑铁律 — 严禁违反】:
1. 电流表(AMMETER_DC)必须串联在电源回路: VCC→I+→I-→负载。绝不并联！
2. 电压表(VOLTMETER_DC)必须分布在不同节点: N块表各自测量不同电阻的压降
   - 例: R1/R2分压 → 表1测R1(VCC↔中点SENSE), 表2测R2(中点SENSE↔GND)
   - 多块电压表绝不能全部接在同一节点对！
3. 所有仪器(电压表/电流表/示波器)统一使用网络标号，禁止长导线连接仪器
4. 每个电路必须包含VCC和GND符号
5. 电源名(VCC/GND)绝不能用于非电源网络

【输出规则】:
1. 只输出器件大类、功能描述、参数区间
2. 如果有明确型号需求，填入 explicitModel 字段（必须是库内已有的 libDevId）
3. 陌生或无法归类的需求写入 oodFlags
4. 根据电路类型自动判断是否需要仪器
5. MCU 电路必须包含: 晶振、去耦电容、复位上拉电阻、VCC、GND
6. LED 电路必须配对限流电阻（R_330），单个 LED 至少 220Ω
7. 运放电路必须包含反馈电阻（闭环），输入不可浮空
8. I2C 器件必须配 4.7kΩ 上拉电阻（R_4.7k）

【强制器件 — 任何电路都必须包含，缺一不可】:
- 必须输出 VCC 电源符号: {"func":"电源正极","dev_type":"VCC","param_constraint":{},"priority":10,"explicitModel":"VCC"}
- 必须输出 GND 接地符号: {"func":"电源地","dev_type":"GND","param_constraint":{},"priority":10,"explicitModel":"GND"}
- 电阻器件必须尽量指定 explicitModel (如 R_1k, R_10k, R_4.7k 等)，不要只写 "Resistor"

【仪器自动追加规则 — 严格按用户需求】:
- 电路含电阻分压/传感器 → 追加 VOLTMETER_DC
- 用户提到"电流表""测电流""总电流" → 必须追加 AMMETER_DC
- 用户说"N个电压表"→ 必须输出N个 VOLTMETER_DC
- 电路含 MCU+UART → 追加 UART_TERMINAL
- 电路含运放/放大器 → 追加 OSCILLOSCOPE
- 电路含数字 IC → 追加 LOGIC_ANALYZER
- 电路含电源/稳压 → 追加 VOLTMETER_DC

【防幻觉规则】:
- 禁止编造库外型号
- 不确定的器件放入 oodFlags，不要猜测

【多轮对话编辑模式】:
- 如果 generation_mode=edit，必须在现有器件基础上增量修改，不要从零重建
- 参考 conversation_history 理解上下文，只调整用户要求变更的部分
- 保留未涉及修改的现有器件

输出纯 JSON（可用 snake_case 或 camelCase），无 markdown 包裹。
Schema: {"function_module":["..."],"device_require_list":[{"func":"...","dev_type":"...","param_constraint":{},"priority":1-10,"explicitModel":"..."|null}],"circuit_constraint":"...","oodFlags":["..."]}`,
    userTemplate: '{{conversation_history}}{{generation_mode}}用户需求：\n{{user_prompt}}\n\n场景：{{scene}}\n\n局部电路（可选）：\n{{partial_topo}}\n\n可用器件库摘要：\n{{library_catalog}}'
};
const LAYOUT_DEFAULT: PromptTemplate = {
    id: 'layout_v4',
    version: '4.0.0',
    system: `你是嵌入式原理图布局专家。根据器件列表直接输出每个器件的画布坐标 (x, y)。

【坐标系说明】:
- 画布原点在左上角，x向右增大，y向下增大
- 标准栅格间距 = 20mil，所有坐标必须是 20 的整数倍
- 典型器件尺寸约 60×60mil，引脚间距约 20mil
- 画布有效范围: x∈[40, 1200], y∈[40, 800]

【布局规则 — 严格遵守】:
1. MCU 必须 central: 画布中央区域 x∈[400, 700], y∈[250, 450]
2. 晶振 adjacent MCU: 距离 MCU ≤ 100mil
3. 去耦电容 adjacent 对应 VDD/VSS 引脚: 距离 ≤ 50mil
4. 电源符号(VCC/GND) → 左侧边缘: x∈[40, 120], VCC在上(y≈80), GND在下(y≈500-700)
5. 模拟器件(运放/传感器) 与 数字器件(逻辑IC/LED) 分离: 间距 ≥ 150mil
6. 仪器(示波器/电压表/电流表) → 右侧排列: x∈[800, 1100]
7. LED+限流电阻: 水平并排，电阻在左 LED在右
8. 电流表放在VCC与第一电阻之间 (视觉串联): 电流表 y < 第一电阻 y
9. 电压表放在对应被测电阻右侧: 电压表 x > 被测电阻 x
10. 分压电阻链: 从上到下竖直排列 (VCC→R1→中点→R2→GND)
11. 同类型器件垂直间距 ≥ 60mil，不同类型器件水平间距 ≥ 80mil

【仪器布局铁律】:
- 电流表必须放在VCC与第一电阻之间 (视觉串联): I+在上接VCC, I-在下接电阻
- 测量R1的电压表放在R1右侧, 测量R2的电压表放在R2右侧
- 仪器间垂直间距 ≥ 80mil

输出纯 JSON（可用 snake_case 或 camelCase），无 markdown 包裹。
必须包含 positions 数组，为每个器件指定精确的 (x, y) 坐标。
Schema: {"positions":[{"deviceId":"器件refName或libDevId","x":number,"y":number,"rotate":0|90|180|270}],"moduleGroup":{"groupName":["deviceId",...]},"constraintRules":[{"type":"adjacent|separate|central|edge","target":"...","a":"...","b":"..."}],"signalWeight":{"signalName":priority}}`,
    userTemplate: '器件：{{device_list}}\n\n约束：{{circuit_constraint}}\n\nMCU：{{mcu_family}}'
};
const ROUTE_DEFAULT: PromptTemplate = {
    id: 'route_v3',
    version: '3.0.0',
    system: `你是布线工程师。只输出 JSON：net_priority、special_net_rules、global_constraint、connection_mode_hints。

【优先级规则】: GND/VCC=10, 晶振=9, 模拟=7, 总线(I2C/SPI)=5, GPIO=2

【连接方式选择 — 强制规则】:
- 仪器(电压表/电流表/示波器/频率计/UART终端) → 强制网络标号(joinByLabel), 禁止导线
- 晶振/去耦电容 → 强制导线(joinWired), 最短路径
- LED+限流电阻 → 强制导线, 局部连接
- 同区短距(≤150mil)且非仪器 → 导线(joinWired)
- 跨区远距(>150mil)且非晶振/去耦 → 网络标号(joinByLabel)
- 电源轨(VCC/GND) → 标号优先, 就近可用短导线
- 多脚网络(>4引脚) → 强制标号, 避免星形杂乱
- 局部拥塞(>3根不同net导线在同一区域) → 标号

【反模式 — 严禁】:
- 禁止对仪器引脚走长导线（只能用标号+短stub）
- 禁止纯标号网络无物理导线（每个stub至少10mil）
- 禁止标号位置覆盖器件体或引脚
- 禁止不同net导线共享同一路径坐标

【特殊规则】: xtal:shortest_path,no_cross_analog | power:direct_route,no_detour | i2c:parallel_equal_length

禁止输出坐标点。`,
    userTemplate: '拓扑摘要：{{topology_summary}}\n网络列表：{{net_list}}'
};
const DIAG_DEFAULT: PromptTemplate = {
    id: 'diag_v3',
    version: '3.0.0',
    system: `你是资深电子工程师，擅长原理图审查与故障定位。

【诊断流程】:
1. ERC 违规 → 静态拓扑问题
2. 仪器拓扑检查 → 电流表是否串联？电压表是否分布在不同节点？
3. 仿真波形 → 动态行为异常
4. 器件参数 → 设计值合理性
5. 综合判断 → 区分「确定问题」vs「待验证假设」

【仪器拓扑检查清单】:
- 电流表I+接VCC, I-接负载 → 串联正确；I+/I-在同一网络 → 短路错误
- N块电压表各测不同node pair → 分布正确；全测同一node pair → 分布错误
- 分压链 VCC→R1→中点→R2→GND 是否完整
- 所有仪器关键引脚(电流表I+/I-, 电压表V+/COM)是否都已连接

【输出格式】:
## 诊断摘要
## 确定问题
## 待验证假设
## 修复优先级

使用中文，条理清晰。`,
    userTemplate: 'ERC：{{erc_violations}}\n拓扑：{{topology}}'
};
const SELF_REVIEW_DEFAULT: PromptTemplate = {
    id: 'self_review_v1',
    version: '1.0.0',
    system: `你是资深原理图审查专家。检查生成的电路拓扑，识别问题并给出修复方案。

【审查清单 — 逐项检查】:
1. VCC/GND: 是否存在？缺少则为致命错误
2. 仪器拓扑: 电流表是否串联(I+/I-在不同网络)? 电压表V+/COM是否分布在不同测量节点?
3. 导线布局: 是否存在导线穿过器件体? 导线是否贴近无关引脚? 不同网络导线是否重叠?
4. 器件参数: 限流电阻值是否合理(LED≥220Ω)? 上拉电阻(I2C=4.7k, RST=10k)?
5. MCU最小系统: 晶振+去耦电容+RST上拉是否完整?
6. 浮空引脚: 关键引脚(MCU RST/VDD, 运放输入)是否浮空?
7. 网络完整性: 每个网络是否至少连接2个引脚?

【修复方案 — 具体可执行】:
- add_component: 添加缺失器件(libDevId, refName, 建议坐标x/y)
- remove_component: 移除冗余/错误器件
- change_param: 修改器件参数值
- rebuild_instrument: 仪器拓扑重建(电流表重新串联/电压表重新分布) + 密集区标号转换
- reroute: 重新布线(避开器件体/消除重叠/引脚接近/连线拥挤)

【重要】若密度报告显示连线拥挤(多网汇聚于同一格)，应将拥挤区域的 joinWired 改为 joinByLabel 标号。

输出纯 JSON，无 markdown 包裹。
Schema: {
  "passed": true/false,
  "issues": [
    {"type":"missing_power|instrument_topo|wire_layout|component_value|mcu_system|floating_pin|net_integrity",
     "severity":"error|warning",
     "desc":"问题描述(中文)",
     "targetDevice":"受影响的器件refName或libDevId",
     "fixAction":"add_component|remove_component|change_param|rebuild_instrument|reroute",
     "fixDetail":{
       "libDevId":"要添加的器件库ID",
       "refName":"建议位号",
       "x":建议坐标x,
       "y":建议坐标y,
       "paramKey":"参数键名",
       "paramValue":"参数值",
       "reason":"修复原因(一句话)"
     }}
  ],
  "summary":"审查总结(一句话中文)"
}`,
    userTemplate: '{{conversation_history}}用户原始需求：{{user_prompt}}\n\n=== 当前电路拓扑 ===\n器件({{device_count}}个):\n{{device_summary}}\n\n网络({{net_count}}个):\n{{net_summary}}\n\n导线({{wire_count}}段):\n{{wire_summary}}\n\nERC违规({{erc_count}}条):\n{{erc_summary}}\n\n=== 位置+密度报告 ===\n{{density_report}}\n\n请逐项审查并给出修复方案。对密集区的导线问题，优先考虑将 joinWired 改为 joinByLabel。'
};
const GEN_SCH_DEFAULT: PromptTemplate = {
    id: 'gen_sch_v3',
    version: '3.0.0',
    system: `根据用户自然语言描述生成完整原理图拓扑。

【核心规则】:
1. 每个 net 至少连接 2 pin
2. MCU 必须有电源(VCC/GND)、复位(NRST+R_10k→VCC)、时钟网络(XTAL+22pF×2→GND)
3. refDes 前缀: R=电阻, C=电容, U=IC/MCU, D=二极管, LED=LED, X=晶振
4. STM32: BOOT0→GND, 每个 VDD→100nF→GND
5. 8051: EA→VCC, RST→10kΩ→VCC+10uF→GND
6. 所有器件必须来自可用器件库

【仪器拓扑铁律】:
- 电流表串联: VCC→I+→I-→负载 (绝不在同一网络)
- 电压表分布: 多块表分别测不同电阻的压降
- 仪器用网络标号: joinByLabel, 不用长导线

输出纯 JSON，符合 SchTopology 结构。禁止 markdown 包裹。`,
    userTemplate: '需求：{{user_prompt}}\n\n可用器件库摘要：{{library_summary}}'
};
const NET_PLAN_DEFAULT: PromptTemplate = {
    id: 'net_plan_v1',
    version: '1.0.0',
    system: `你是原理图网络拓扑规划专家。根据已放置的器件列表，推理并输出完整的网络连接计划。

你拥有所有器件的完整信息（ID、引脚、位置坐标）以及拥挤度分析数据，你的任务是：
1. 分析电路结构，识别功能模块（分压链、MCU最小系统、LED支路、仪器测量回路等）
2. 为每个网络分配合理的名称和类型
3. 【关键】由你自主决定每个连接的 mode (joinWired vs joinByLabel) — 参考拥挤度分析 + 位置关系
4. 规划导线走向，确保布线美观、无重合、无不必要交叉
5. 输出完整的 netPlan JSON

【你必须遵循的拓扑铁律 — 违反即为错误】:

1. 电流表(AMMETER_DC)必须串联在电源回路中:
   - I+ 接 VCC（或前级电源），I- 接负载电阻
   - I+ 和 I- 绝不在同一网络中！如果在同一网络 = 短路
   - 正确: VCC→I+→I-→R1(1脚)。中间需要创建 VCC_AM 网络承载 I-→R1 的连接

2. 电压表(VOLTMETER_DC)必须分布在不同的测量节点对上:
   - N块电压表各自测量不同的电阻压降
   - 例: R1/R2分压 → 表1测R1(nodes: VCC_AM↔SENSE), 表2测R2(nodes: SENSE↔GND)
   - 多块电压表绝不能全部测量同一对节点！
   - 每块表的 V+ 接被测高点，COM 接被测低点或 GND

3. 所有仪器引脚(电压表V+/COM、电流表I+/I-、示波器CH1/GND等)必须入网:
   - 任何仪器引脚不得浮空
   - 仪器的 GND/COM 必须最终连到 GND 网络

4. 连接方式选择规则 — 导线优先原则:
   【基本原则】能用导线直连就用导线，只在导线会造成视觉混乱或穿过其他器件时才使用标号。

   强制 joinWired（导线直连）:
   - 电源符号 VCC/GND → 相邻负载器件 → 导线直连
   - 晶振/去耦电容 → 最短路径导线，不跨越其他器件
   - LED+限流电阻 → 导线局部直连
   - 简单分压电路（≤5个器件，无MCU）→ 全部使用导线连接
   - 同一功能组的就近器件对 → 导线连接（即使距离>150mil，只要路径清晰无遮挡即可）
   - 2~4个引脚的小网络且引脚在同一区域 → 导线

   使用 joinByLabel（网络标号）的场景（仅在以下情况）:
   - MCU 多引脚（≥8个GPIO）分散连接多个外设 → 标号避免导线交叉混乱
   - 同网络 ≥6个引脚分布在 ≥3个不同区域的器件上 → 标号管理
   - 信号需要跨越其他大型器件体（如MCU封装）→ 用标号代替长导线
   - 仪器仪表的 GND/COM 共用引脚需要合并到全局 GND → 标号合并

   严格禁止:
   - 简单3~5器件电路过度使用标号 → 浪费空间、严重降低可读性
   - 仅2~3个引脚的短距网络使用标号 → 必须用导线
   - 将 joinByLabel 当作默认选择 → 导线才是默认选择

5. 网络命名规则:
   - 电源网络: VCC, GND（不允许信号网络使用这些名字）
   - 分压中点: SENSE, SENSE_1, SENSE_2, ...
   - 电流表后网络: VCC_AM
   - 电压表测量点: PROBE_1, PROBE_2, ...
   - 信号网络: 描述性名称，如 LED_CTRL, UART_TX, NRST

6. MCU 最小系统规则:
   - 每个 VDD 引脚 → 连接 VCC + 就近 100nF 去耦电容到 GND（去耦电容用导线，VCC/GND用标号）
   - 每个 VSS 引脚 → 连接 GND（用标号）
   - NRST/RST → 10kΩ 上拉电阻 → VCC
   - BOOT0(STM32) → GND
   - EA(8051) → VCC
   - 晶振 XTAL → OSC_IN/OSC_OUT + 22pF×2→GND（全部用导线最短路径）

7. LED 驱动规则:
   - LED 阳极(A) → 限流电阻 → VCC 或 MCU GPIO
   - LED 阴极(K) → GND
   - 每个 LED 必须串联限流电阻(至少220Ω)

8. 运放规则:
   - 必须有反馈路径（闭环），不允许开环
   - 同相/反相输入不可浮空
   - V+ 接 VCC, V- 接 GND

9. 导线走向与排布规则（影响布线美观度）:
   - 导线只能正交走线（水平+垂直），禁止斜向
   - 导线不得穿过任何器件体（body），规划走线路径时参考器件位置坐标避开器件占用区域
   - 不同网络的导线禁止在任何位置共线重叠（同网络导线允许汇合）
   - 减少不必要的导线交叉: 利用正交弯折绕开已有走线
   - 优先从器件的左右两侧水平引出导线，避免垂直方向穿越一排引脚
   - 电源线尽量走器件上方区域，地线尽量走器件下方区域，信号线走左右两侧
   - 规划 joinWired 网络时，考虑器件间相对位置，选择不会穿越第三器件的路径

【输出格式 — 严格 JSON，无 markdown 包裹】:

{
  "nets": [
    {
      "name": "网络名",
      "type": "power|ground|signal",
      "connections": [
        {
          "compRef": "器件 refDes",
          "pinId": "引脚ID",
          "pinName": "引脚名",
          "mode": "joinWired|joinByLabel"
        }
      ],
      "routeWaypoints": [[{"x":120,"y":200},{"x":180,"y":200}]]
    }
  ],
  "labels": [],
  "wiringHints": {
    "priorityOrder": ["GND", "VCC", "SENSE"],
    "forceWire": [],
    "forceLabel": []
  },
  "routeStrategy": {"VCC":"avoid_cross","SENSE":"direct"},
  "topologyNotes": "全导线直连分压电路，2个90°弯折点避开电阻体"
}

每个 net 至少包含 2 个 connections。
labels 可留空 [] — 系统会自动为每个 joinByLabel 引脚生成标号(默认用网络名作为标号文字)。
wiringHints.forceWire 列出必须用导线直连的网络名。
wiringHints.forceLabel 列出需要标号管理的网络名。

【必须】routeWaypoints — 每条 joinWired 导线必须指定弯折坐标:
  这是强制要求，不是可选功能。每个 joinWired 网络必须包含 routeWaypoints 数组。
  格式: "routeWaypoints": [[弯折点序列], [弯折点序列], ...]
  - 最外层数组: 每个子数组对应 connections[i]→connections[i+1] 之间的那段导线
  - 每段导线可以有 1 个或多个 90° 正交弯折点（数量不限，根据实际需要）
  - 每个弯折点是一个 {"x":坐标,"y":坐标} 对象
  - 弯折点必须按导线经过的先后顺序排列

  弯折点坐标计算方法:
  1. 从器件位置总览中获取两端器件的坐标
  2. 从器件详情中查找引脚 ID，根据器件类型估算引脚位置
  3. 规划正交走线路径（只能水平+垂直，不能斜向）
  4. 弯折点放在不会穿过器件体的位置
  5. 电源线(VCC)尽量走器件上方，地线(GND)走器件下方，信号线走左右

  美观排布规则:
  - 多条并行导线使用统一的弯折 X 或 Y 坐标（像总线一样整齐）
  - 对称连接的导线使用对称的弯折点
  - 避免在器件引脚密集处弯折
  - 弯折点间距 ≥20mil，避免锐角或发夹弯
  - 优先从器件左右两侧引出，在器件外部拐弯

  示例 1 — VCC→R1(引脚1) 带1个弯折:
    VCC 位置(200,100), R1位置(200,300)
    → routeWaypoints: [[{"x":200,"y":200}]]  // 先水平走到x=200, 再向下到R1引脚
    实际路径: VCC引脚→(200,200)→R1引脚1

  示例 2 — R1(引脚2)→R2(引脚1) 带2个弯折绕开中间器件:
    R1位置(200,300), R2位置(400,300), 中间有器件Q1在(300,280)
    → routeWaypoints: [[{"x":200,"y":350},{"x":400,"y":350}]]  // 先向下绕到y=350, 再水平走到x=400, 再向上到R2
    实际路径: R1引脚2→(200,350)→(400,350)→R2引脚1

  示例 3 — MCU→LED 跨区域连接:
    MCU位置(100,500), LED位置(500,100)
    途经中间区域避免穿越其他器件
    → routeWaypoints: [[{"x":100,"y":300},{"x":300,"y":300},{"x":300,"y":100}]]
    实际路径: MCU引脚→(100,300)→(300,300)→(300,100)→LED引脚

【必须】routeStrategy — 每个网络的布线策略:
  Key=网络名, Value="direct"(无遮挡直连) | "avoid_cross"(需绕开其他器件/导线) | "bus_style"(多线并行走线)

MCU 引脚 ID 必须使用提供的引脚列表中的实际 pinId。
输出紧凑但不可省略 routeWaypoints 和 routeStrategy。
仔细检查: 电流表的 I+ 和 I- 是否在不同网络中？电压表是否分布在不同的测量点对上？
每个 joinWired 网络是否都填写了 routeWaypoints？`,
    userTemplate: `用户需求：{{user_prompt}}

=== 已放置器件列表（含完整引脚信息） ===
{{device_detail}}

=== 器件位置总览 ===
{{position_summary}}

请根据以上信息，推理电路拓扑并输出完整的 netPlan JSON。`
};
// ---- 器件库摘要缓存 ----
let cachedCatalogSummary: string = '';
let cachedCatalogLibIds: string = '';
function buildCompactCatalog(library: IComponentLibrary): string {
    const lines: string[] = [];
    const categories = library.getCategories();
    for (const cat of categories) {
        const result = library.listByCategory(cat, 1, 200);
        if (result.items.length === 0) {
            continue;
        }
        lines.push(`【${cat}】`);
        for (const d of result.items) {
            const pinCount = d.pins?.length ?? 0;
            const rules = d.aiWiringRules?.join(',') ?? '-';
            lines.push(`  ${d.id} | ${d.name} | 引脚数:${pinCount} | 规则:${rules}`);
        }
    }
    return lines.length > 0 ? lines.join('\n') : '(器件库为空)';
}
function buildLibIdList(library: IComponentLibrary): string {
    const ids: string[] = [];
    const categories = library.getCategories();
    for (const cat of categories) {
        const result = library.listByCategory(cat, 1, 200);
        for (const d of result.items) {
            ids.push(d.id);
        }
    }
    return ids.join(', ');
}
export class PromptLoader {
    static load(name: string): PromptTemplate {
        switch (name) {
            case 'device_select':
                return DEVICE_SELECT_DEFAULT;
            case 'layout':
                return LAYOUT_DEFAULT;
            case 'route':
                return ROUTE_DEFAULT;
            case 'diag':
                return DIAG_DEFAULT;
            case 'gen_sch':
                return GEN_SCH_DEFAULT;
            case 'net_plan':
                return NET_PLAN_DEFAULT;
            case 'self_review':
                return SELF_REVIEW_DEFAULT;
            default:
                return DEVICE_SELECT_DEFAULT;
        }
    }
    static render(template: PromptTemplate, vars: PromptVarEntry[]): string {
        const user = applyPromptVars(template.userTemplate, vars);
        return `${template.system}\n\n${user}`;
    }
    /**
     * 构建增强版 prompt：注入器件库目录到 system prompt + 拓扑反模式警示。
     * 每次调用时缓存器件库摘要，避免重复构建。
     */
    static renderEnriched(template: PromptTemplate, vars: PromptVarEntry[], library: IComponentLibrary): string {
        if (cachedCatalogSummary.length === 0) {
            cachedCatalogSummary = buildCompactCatalog(library);
            cachedCatalogLibIds = buildLibIdList(library);
        }
        // 在 user 侧追加库目录，LLM 可以看到可用的精确 libDevId
        let enrichedUser = template.userTemplate;
        if (enrichedUser.includes('{{library_catalog}}')) {
            enrichedUser = enrichedUser.replace('{{library_catalog}}', cachedCatalogSummary);
        }
        if (enrichedUser.includes('{{library_summary}}')) {
            enrichedUser = enrichedUser.replace('{{library_summary}}', `可用 libDevId: ${cachedCatalogLibIds}\n${cachedCatalogSummary}`);
        }
        const user = applyPromptVars(enrichedUser, vars);
        // v3.0: 注入通用拓扑反模式警示到所有 enriched prompt
        const topologyGuard = `
【拓扑反模式警示 — 生成结果中绝不应出现以下错误】:
1. 电流表 I+/I- 在同一网络 → 短路！应串联在 VCC 与负载之间
2. 所有电压表测同一节点 → 应分布在分压链不同节点上
3. VCC 直接连到地（无负载电阻） → 短路！应有分压/负载电阻
4. 器件完全浮空(无任何引脚连接) → 连接或删除
5. 信号网络命名为 VCC/GND → 使用描述性名称或加 _SIG 后缀
6. GPIO/IO引脚直连 VCC/GND → 通过限流电阻连接`;
        // 在 system prompt 末尾追加可用器件 ID 清单 + 拓扑警示
        const idHint = `\n\n【可用器件 libDevId 清单 — 只能使用下列 ID】:\n${cachedCatalogLibIds}`;
        return `${template.system}${topologyGuard}${idHint}\n\n${user}`;
    }
    /** 清除器件库缓存（库更新后调用） */
    static clearCatalogCache(): void {
        cachedCatalogSummary = '';
        cachedCatalogLibIds = '';
    }
    /** 从 LLM 响应中提取 JSON 对象 — 处理多种常见格式 */
    static extractJson<T>(content: string): T | null {
        if (!content) {
            return null;
        }
        const trimmed = content.trim();
        // 策略1: 纯 JSON
        try {
            return JSON.parse(trimmed) as T;
        }
        catch (_e) {
            // continue
        }
        // 策略2: 从 markdown 代码块中提取 (```json 或 ```)
        const codeStart = trimmed.indexOf('```');
        if (codeStart >= 0) {
            const afterStart = trimmed.indexOf('\n', codeStart + 3);
            if (afterStart >= 0) {
                const codeEnd = trimmed.indexOf('```', afterStart + 1);
                if (codeEnd > afterStart) {
                    const inner = trimmed.substring(afterStart + 1, codeEnd).trim();
                    if (inner.length > 0) {
                        try {
                            return JSON.parse(inner) as T;
                        }
                        catch (_e2) {
                            // continue
                        }
                    }
                }
            }
        }
        // 策略3: 从开头 { 到结尾 } 的贪婪提取
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(trimmed.substring(start, end + 1)) as T;
            }
            catch (_e3) {
                // continue
            }
        }
        return null;
    }
    /** 获取缓存的器件库 ID 列表，供别处使用 */
    static getCachedLibIds(): string {
        return cachedCatalogLibIds;
    }
    /**
     * v3.2: 构建供 LLM net_plan 使用的器件详情字符串。
     * 每个器件包含 refDes, libDevId, 位置, 完整引脚列表及世界坐标。
     * 引脚世界坐标由 TemplateSchematicKit.pinOffset + 器件位置计算。
     */
    static buildDeviceDetailForNetPlan(topo: SchTopology, library: IComponentLibrary): string {
        if (topo.deviceList.length === 0) {
            return '(无器件)';
        }
        const lines: string[] = [];
        for (let i = 0; i < topo.deviceList.length; i++) {
            const d = topo.deviceList[i];
            lines.push(`[${i + 1}] refDes="${d.refName}" libDevId="${d.libDevId}" 位置=(${Math.round(d.x)},${Math.round(d.y)})`);
            const comp = library.getComponent(d.libDevId);
            if (comp.success && comp.data && comp.data.pins.length > 0) {
                const pinLines: string[] = [];
                for (let pi = 0; pi < comp.data.pins.length; pi++) {
                    const p = comp.data.pins[pi];
                    const localOff = TemplateSchematicKit.pinOffset(d.libDevId, p.id, p.name);
                    const wx = Math.round(d.x + localOff.x);
                    const wy = Math.round(d.y + localOff.y);
                    pinLines.push(`${p.id}(${p.name})@(${wx},${wy})`);
                }
                lines.push(`  引脚世界坐标: ${pinLines.join('  ')}`);
            }
            else {
                const meta = library.getDeviceMeta(d.libDevId);
                const metaPins = meta.success && meta.data ? meta.data.pin_list : [];
                if (metaPins.length > 0) {
                    const pinLines: string[] = [];
                    for (let pi = 0; pi < metaPins.length; pi++) {
                        const mp = metaPins[pi];
                        const localOff = TemplateSchematicKit.pinOffset(d.libDevId, mp.pin_id, mp.pin_label ?? mp.pin_id);
                        const wx = Math.round(d.x + localOff.x);
                        const wy = Math.round(d.y + localOff.y);
                        pinLines.push(`${mp.pin_id}(${mp.pin_label ?? mp.pin_id})@(${wx},${wy})`);
                    }
                    lines.push(`  引脚世界坐标: ${pinLines.join('  ')}`);
                }
                else {
                    lines.push('  引脚: (无引脚信息)');
                }
            }
        }
        return lines.join('\n');
    }
    /**
     * v3.2: 构建位置总览 — 包含相对方位和距离分组，帮助 LLM 规划导线走向。
     * 标注器件间水平/垂直距离和方位关系，以指导导线方向选择。
     */
    static buildPositionSummary(topo: SchTopology): string {
        if (topo.deviceList.length === 0) {
            return '(无器件)';
        }
        const lines: string[] = [];
        lines.push(`共 ${topo.deviceList.length} 个器件:\n`);
        // 器件位置列表（含分类标记）
        for (let i = 0; i < topo.deviceList.length; i++) {
            const d = topo.deviceList[i];
            const id = d.libDevId.toUpperCase();
            let tag = '';
            if (id.includes('MCU') || id.includes('STM32') || id.includes('AT89') || id.includes('STC')) {
                tag = ' [MCU]';
            }
            else if (id === 'VCC' || id === 'GND') {
                tag = ' [电源]';
            }
            else if (id.includes('AMMETER') || id.includes('VOLTMETER') || id.includes('MULTIMETER')) {
                tag = ' [仪器]';
            }
            else if (id.includes('LED')) {
                tag = ' [LED]';
            }
            else if (id.startsWith('R_')) {
                tag = ' [电阻]';
            }
            else if (id.startsWith('C_')) {
                tag = ' [电容]';
            }
            else if (id.includes('OSC') || id.includes('XTAL') || id.includes('CRYSTAL')) {
                tag = ' [晶振]';
            }
            lines.push(`  ${d.refName}${tag} @ (${Math.round(d.x)}, ${Math.round(d.y)})`);
        }
        // 距离和方位矩阵（对所有器件对，帮助规划走线方向）
        lines.push('');
        lines.push('器件对距离与方位（用于规划导线走向）:');
        const pairs: string[] = [];
        for (let i = 0; i < topo.deviceList.length; i++) {
            for (let j = i + 1; j < topo.deviceList.length; j++) {
                const a = topo.deviceList[i];
                const b = topo.deviceList[j];
                const dx = Math.round(b.x - a.x);
                const dy = Math.round(b.y - a.y);
                const dist = Math.round(Math.hypot(dx, dy));
                // 方位
                let hDir = '';
                if (Math.abs(dx) > Math.abs(dy) * 0.5) {
                    hDir = dx > 0 ? '→右' : '←左';
                }
                let vDir = '';
                if (Math.abs(dy) > Math.abs(dx) * 0.5) {
                    vDir = dy > 0 ? '↓下' : '↑上';
                }
                const dir = hDir + vDir;
                const dirStr = dir.length > 0 ? ` ${dir}` : '';
                // 导线建议
                let wireTip = '';
                if (dist <= 200) {
                    wireTip = ' [近距-导线直连]';
                }
                else if (dist <= 500) {
                    wireTip = ' [中距-可用导线]';
                }
                else {
                    wireTip = ' [远距-考虑标号]';
                }
                pairs.push(`  ${a.refName}↔${b.refName}: dx=${dx} dy=${dy} dist=${dist}${dirStr}${wireTip}`);
            }
        }
        // 按距离排序，近的在前
        pairs.sort();
        for (let k = 0; k < pairs.length; k++) {
            lines.push(pairs[k]);
        }
        // 布局区域提示
        lines.push('');
        lines.push('布线区域建议:');
        lines.push('  器件上方(y小)区域 → 适合走电源线 VCC');
        lines.push('  器件下方(y大)区域 → 适合走地线 GND');
        lines.push('  器件左右两侧 → 适合走信号线');
        lines.push('  导线不应穿过任何器件的 body 区域(器件中心±55mil水平, ±30mil垂直)');
        // 密度/拥挤度分析 — 帮助 LLM 决定何处使用标号
        lines.push('');
        lines.push('=== 拥挤度分析（用于决定 joinByLabel vs joinWired） ===');
        const clusters = PromptLoader.detectClusters(topo);
        if (clusters.length > 0) {
            lines.push(`检测到 ${clusters.length} 个器件密集区:`);
            for (let ci = 0; ci < clusters.length; ci++) {
                const c = clusters[ci];
                const devNames = c.devices.map(d => d.refName).join(', ');
                lines.push(`  密集区${ci + 1}: [${devNames}] ` +
                    `中心(${Math.round(c.cx)},${Math.round(c.cy)}) 范围${Math.round(c.radius)}mil ` +
                    `(${c.devices.length}个器件)`);
                if (c.devices.length >= 5) {
                    lines.push(`    ⚠ 此区域器件密集(${c.devices.length}个) → 强烈建议使用 joinByLabel 标号连接`);
                }
                else if (c.devices.length >= 3) {
                    lines.push(`    💡 此区域器件较密集 → 考虑对穿越此区域的跨区域信号使用标号`);
                }
            }
        }
        else {
            lines.push('  器件分布均匀，无可识别的密集区');
        }
        const totalWireEstimate = topo.deviceList.length * 2;
        if (totalWireEstimate > 10) {
            lines.push(`  预估导线数>${totalWireEstimate} → 建议对跨区域信号优先使用 joinByLabel 标号管理`);
        }
        lines.push('  标号决策原则: 你(LLM)决定每个连接的 mode。密集区优先标号，稀疏区优先导线。');
        // 引脚密度分析 — 预测连线拥挤区域
        lines.push('');
        lines.push('=== 引脚密度分析（预测连线拥挤区域，帮助决定标号使用） ===');
        const pinHotspots = PromptLoader.analyzePinDensity(topo);
        if (pinHotspots.length > 0) {
            for (const hs of pinHotspots) {
                const tag = hs.pinCount >= 15 ? '极高密度 ⚠' :
                    hs.pinCount >= 8 ? '高密度 💡' : '中密度';
                lines.push(`  区域(${hs.cellX},${hs.cellY}) ${tag}: ` +
                    `约${hs.pinCount}个引脚集中 → 预计${hs.estWireCount}条导线汇聚`);
                if (hs.pinCount >= 15) {
                    lines.push(`    ⚠ 此区域引脚极度密集 → 必须使用 joinByLabel 标号管理跨区域信号`);
                }
                else if (hs.pinCount >= 8) {
                    lines.push(`    💡 此区域引脚较密 → 强烈建议穿越此区域的信号使用标号`);
                }
            }
        }
        else {
            lines.push('  引脚分布均匀，无高密度引脚集中区');
        }
        return lines.join('\n');
    }
    /** 简单密度聚类: 将间距<150mil的器件归为一个密集区, 返回所有≥3器件的聚类 */
    private static detectClusters(topo: SchTopology): ClusterInfo[] {
        const visited = new Set<string>();
        const clusters: ClusterInfo[] = [];
        const THRESHOLD = 150; // mil, 聚类距离阈值
        for (const d of topo.deviceList) {
            if (visited.has(d.instUuid))
                continue;
            const group: DeviceInst[] = [d];
            visited.add(d.instUuid);
            // BFS 扩展
            let head = 0;
            while (head < group.length) {
                const cur = group[head];
                for (const other of topo.deviceList) {
                    if (visited.has(other.instUuid))
                        continue;
                    const dist = Math.hypot(other.x - cur.x, other.y - cur.y);
                    if (dist < THRESHOLD) {
                        group.push(other);
                        visited.add(other.instUuid);
                    }
                }
                head++;
            }
            if (group.length >= 3) {
                let sumX = 0, sumY = 0;
                for (const dev of group) {
                    sumX += dev.x;
                    sumY += dev.y;
                }
                const cx = sumX / group.length;
                const cy = sumY / group.length;
                let maxR = 0;
                for (const dev of group) {
                    const r = Math.hypot(dev.x - cx, dev.y - cy);
                    if (r > maxR)
                        maxR = r;
                }
                clusters.push({ devices: group, cx, cy, radius: maxR + 30 });
            }
        }
        return clusters;
    }
    /** 引脚密度分析: 100mil网格, 估算每格引脚数, 返回高密度区域 */
    private static analyzePinDensity(topo: SchTopology): PinHotspot[] {
        const CELL = 100; // mil
        const cellMap = new Map<string, number>();
        const deviceCellMap = new Map<string, string[]>(); // devUuid → cellKeys
        for (const dev of topo.deviceList) {
            const pinCount = PromptLoader.estimatePinCount(dev.libDevId);
            const cx = Math.floor(dev.x / CELL);
            const cy = Math.floor(dev.y / CELL);
            // 引脚分布在器件中心及其相邻格
            const cells: string[] = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    const key = `${cx + dx},${cy + dy}`;
                    cells.push(key);
                    cellMap.set(key, (cellMap.get(key) ?? 0) + pinCount);
                }
            }
            deviceCellMap.set(dev.instUuid, cells);
        }
        const hotspots: PinHotspot[] = [];
        cellMap.forEach((pinCount, key) => {
            if (pinCount >= 5) {
                const parts = key.split(',');
                const cellX = Number(parts[0]) * CELL;
                const cellY = Number(parts[1]) * CELL;
                // 汇集到此格的器件
                const devsInCell: string[] = [];
                for (const dev of topo.deviceList) {
                    const devCellX = Math.floor(dev.x / CELL);
                    const devCellY = Math.floor(dev.y / CELL);
                    if (Math.abs(devCellX - Number(parts[0])) <= 1 &&
                        Math.abs(devCellY - Number(parts[1])) <= 1) {
                        devsInCell.push(dev.refName ?? dev.libDevId);
                    }
                }
                hotspots.push({
                    cellX, cellY, pinCount,
                    estWireCount: Math.round(pinCount * 0.6),
                    devices: devsInCell.slice(0, 5)
                });
            }
        });
        // 按引脚数降序, 取前5
        hotspots.sort((a, b) => b.pinCount - a.pinCount);
        return hotspots.slice(0, 5);
    }
    /** 根据器件库ID估算引脚数 */
    private static estimatePinCount(libDevId: string): number {
        const id = libDevId.toUpperCase();
        if (id.includes('STM32') || id.includes('AT89') || id.includes('STC'))
            return 40;
        if (id.includes('MCU') || id.includes('ESP32'))
            return 30;
        if (id.includes('LCD') || id.includes('DISPLAY'))
            return 16;
        if (id.includes('OP') || id.includes('LM358') || id.includes('LM324'))
            return 8;
        if (id.includes('LOGIC') || id.includes('GATE') || id.includes('74'))
            return 14;
        if (id.includes('I2C') || id.includes('SPI') || id.includes('UART'))
            return 8;
        if (id.includes('AMMETER') || id.includes('VOLTMETER') || id.includes('METER'))
            return 3;
        if (id.includes('OSCILLOSCOPE'))
            return 4;
        if (id.startsWith('R_') || id.startsWith('C_') || id.startsWith('LED_') ||
            id.startsWith('L_') || id.startsWith('D_'))
            return 2;
        if (id.includes('XTAL') || id.includes('CRYSTAL') || id.includes('OSC'))
            return 2;
        if (id === 'VCC' || id === 'GND')
            return 1;
        return 4; // 未知器件默认4脚
    }
}
