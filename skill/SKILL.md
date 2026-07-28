# AI 电路仿真图生成与诊断

> **版本**: 5.0 | **管线**: AiPipelineOrchestrator | **平台**: HarmonyOS NEXT
>
> 本技能是规则总纲；**Prompt 文案权威源在 [`skill/prompts/`](prompts/README.md)**。
>
> **运行时加载路径**（真机不读磁盘 `skill/`）:
> `skill/prompts/*.md` → 同步 → `features/ai_engine/.../prompts/templates/*.ets`
> → `PromptLoader.load(runtime_key)` → LLM / 本地引擎
> 本地算法仍由 SemanticNetBuilder / DeviceSelectEngine / FaultDiagnoser /
> ConstrainedWiringEngine / TemplateSchematicKit / DeviceHitGeometry 执行。
>
> **v5.0 核心**:
> - Prompt 分阶段权威源 + 代码镜像，避免文档与运行时漂移
> - 导线避让器件选中命中区 (HIT_PAD=14) 与无关引脚 (≥20mil)
> - 完整生图门禁：ERC 阻断项 + 几何 error
> - 互斥双色指示强制 RELAY_SPDT 触点拓扑

---

## 1. 需求理解与电路分类

### 1.1 电路类型识别

从用户输入中提取关键特征，将电路归入以下类别之一：

| 类别 | 关键特征 | 模板 ID | 复杂度 |
|------|----------|---------|--------|
| MCU 最小系统 | stm32, 51, 单片机, 最小系统 | lab_mcu_stm32 / lab_51_led | 中 |
| 模拟放大 | 运放, 放大, 同相, 反相, 跟随器 | lab_amp | 中 |
| 数字逻辑 | 74HC, 门电路, 与门, 或门, 非门, 真值表 | lab_digital_gates / lab_digital | 中 |
| 电源稳压 | 7805, 1117, 稳压, 电源, LDO | lab_power | 简单 |
| 无源电路 | 电阻, 电容, 分压, 充放电, RC | lab_passive | 简单 |
| 传感器 | DS18B20, 霍尔, 光敏, 温度, LDR | lab_sensor | 中 |
| 串口通信 | UART, 串口, RS232 | lab_uart | 中 |
| 滤波器 | RC滤波, 低通, 高通 | lab_filter | 中 |
| 分立元件 | 三极管, MOSFET, 开关 | lab_discrete | 中 |
| 存储器 | EEPROM, Flash, 24C02, W25Q | lab_memory | 中 |
| 虚拟仪器 | 示波器, 万用表, 功率表, 频率计, 逻辑分析仪, UART | lab_instruments | 中 |
| 混合电路 | 多类型组合 | - | 复杂 |

### 1.2 复杂度评估

```
简单 (≤5 器件):  纯无源 / 单仪器 / 单电源 → 快速路径，跳过 LLM 布局约束
中等 (6-15 器件): MCU最小系统 / 运放 / 逻辑 → 完整管线
复杂 (16+ 器件):  多 MCU / 混合信号 → 完整管线 + 分步验证
```

### 1.3 MCU 识别

```
检测关键词: stm32, f103, f407 → STM32F103C8T6 (3.3V, Cortex-M3)
检测关键词: 51, 8051, at89, stc89 → AT89C51 (5V, 8051)
检测关键词: stc15, stc8 → STC15W408AS (5V, 8051)
未指定: 根据电路复杂度推断是否需要 MCU
```

---

## 2. 器件选型（防幻觉四层校验）

### 2.1 选型流程

```
L1 → LLM 语义理解: 从 prompt 拆解 function_module[] + device_require_list[]
L2 → 本地库匹配:
      explicitModel 存在 → exact 匹配 (libDevId 精确查找)
      否则 → semanticSearch(func + devType + params) → fuzzy 匹配
      仍无 → fuzzyFallback(大类匹配) → 报告缺失
L3 → OOD 检测: 库外型号 → oodFlags[] → 禁止生成
L4 → 参数校验: 耐压/功率/封装是否符合约束
```

### 2.2 MCU 电路强制器件清单

无论用户是否明确提及，以下器件必须包含：

| 器件 | libDevId | 数量 | 连接规则 |
|------|----------|------|----------|
| MCU | STM32F103C8T6 / AT89C51 | 1 | 居中摆放 |
| 晶振 | XTAL_8M / XTAL_11M | 1 | 紧邻 MCU，≤100mil |
| 晶振负载电容 | C_22pF (×2) | 2 | 晶振两脚各串一个到 GND |
| 去耦电容 | C_100nF | N_vdd | 每个 VDD 引脚配 1 个 |
| 大电容 | C_10uF | 1 | 电源入口 |
| 复位上拉 | R_10k | 1 | NRST → R_10k → VCC |
| 电源正极 | VCC | 1 | 左上角 |
| 电源地 | GND | 1 | 左下角 |

### 2.3 运放电路强制器件清单

| 器件 | libDevId | 数量 | 连接规则 |
|------|----------|------|----------|
| 运放 | LM358 | 1 | - |
| 反馈电阻 | R_10k | 1 | OUT → R_10k → IN- |
| 输入电阻 | R_1k | 1 | 信号源 → R_1k → IN- |
| 去耦电容 | C_100nF | 1 | V+ 到 GND |
| 电源 | VCC, GND | 各 1 | - |

### 2.4 LED 电路强制规则

```
每个 LED 必须配对 1 个限流电阻 (R_330)
连接: VCC/GPIO → R_330(pin1) → R_330(pin2) → LED(A) → LED(K) → GND
```

### 2.5 仪器追加规则（与 DeviceSelectPrompt 对齐 — 禁止擅自加仪器）

```
仅当用户明确要求或测量意图时追加：
  电压表/测电压 → VOLTMETER_DC
  电流表/测电流 → AMMETER_DC
  万用表/电阻档/二极管档 → VIRTUAL_METER（V,A,OHM,COM）
  功率表 → POWER_METER（V并/I串）
  示波器/波形 → OSCILLOSCOPE
  逻辑分析仪 → LOGIC_ANALYZER（CH1–CH8）
  频率计 → FREQ_COUNTER；信号源 → SIGNAL_GEN
  UART/串口终端 → UART_TERMINAL
禁止因「含运放/电源/数字IC」自动追加示波器或电压表
每个电路必须至少有 VCC 和 GND
```

---

## 3. 布局摆放

### 3.1 布局硬约束（GA 前执行）

```
MCU 居中: x=CANVAS_W/2, y=CANVAS_H/2 (800×600 → 400, 300)
晶振紧邻: MCU.x-100, MCU.y-20
去耦电容: MCU.x+60+i*30, MCU.y-40
复位电阻: MCU.x+80, MCU.y+60
仪器右列: x=CANVAS_W-140, y=100+i*90
电源左列: VCC(60, mcu.y-80), GND(60, mcu.y+100)
LED 同组: 水平排列, y 对齐, 间距 100mil
```

### 3.2 功能分区

```
┌──────────────────────────────────────────────┐
│  VCC  │          │          │   OSCILLOSCOPE │
│  GND  │   MCU    │  LED+  │   VOLTMETER   │
│  LDO  │   +XTAL  │   R    │   AMMETER     │
│  CAPS │   +RST   │        │   UART_TERM   │
│       │          │        │               │
│  电源区│  核心区  │ 外设区  │   仪器区      │
└──────────────────────────────────────────────┘
```

### 3.3 模拟-数字分区

```
模拟区 (左/上): 运放, 传感器, 基准源
数字区 (右/下): MCU, 逻辑 IC, LED, 继电器
间距: ≥150mil 隔离带
晶振区: 禁止任何信号线穿越
```

### 3.4 GA 参数

```
POP_SIZE=60, GENERATIONS=50, GRID=10mil
适应度权重: adjacency×0.4 + isolation×0.25 + wireLength×0.2 + hfIsolation×0.15 - overlap×0.5
变异率: 前30%代=0.25, 中40%代=0.15, 后30%代=0.05
器件数<4 跳过 Worker 线程, 直接同步 GA
```

---

## 4. 语义建网

### 4.1 建网流程 (v3.0 拓扑感知)

```
1. 确保 VCC/GND 符号存在（不存在则补放）
2. 检测 MCU 类型 → 从器件元数据动态解析引脚
3. MCU 电源网络: 所有 VDD/VCC → VCC 网; 所有 VSS/GND → GND 网
4. MCU 复位/时钟/I2C/BOOT0 等外设网络
5. ★ 阶段A: buildDividerChain() — 构建分压链拓扑 + 电流表串联嵌入
6. LED 支路: drive → R_330 → LED → GND
7. 去耦电容: C_100nF(1) → VCC, C_100nF(2) → GND
8. ★ 阶段B: wireDividerInstruments(topo) — 基于拓扑计划分发电压表
9. ★ 阶段C: wireNonDividerInstruments() — 示波器/频率计/UART等非分压仪器
10. ★ 后验: 仪器引脚完整性 + MCU关键引脚连接验证
```

### 4.2 仪器拓扑铁律 (v4.0 — 严禁违反)

```
┌─────────────────────────────────────────────────────────────────┐
│ 铁律 1: 电流表 AMMETER_DC = 串联，绝不并联                        │
│   ✓ VCC → I+ → I- → 负载 → GND                                  │
│   ✗ I+/I- 同网；或 I+→VCC、I-→负载却形成旁路并联                  │
│                                                                 │
│ 铁律 2: 电压表 VOLTMETER_DC = 并联测节点对；多表不同节点对         │
│   ✓ VM1: V+→VCC, COM→SENSE；VM2: V+→SENSE, COM→GND             │
│   ✗ 多表测同一 high-low 对                                      │
│                                                                 │
│ 铁律 3: POWER_METER — V 并 / I 串；I 路≠V 路节点对               │
│   ✓ V+/V- 跨负载；I+/I- 切入电源支路                             │
│                                                                 │
│ 铁律 4: VIRTUAL_METER 四端 V,A,OHM,COM（勿写 V+）                │
│   DCV/ACV→V∥COM；AMP→A串；OHM/DIODE→OHM∥COM                     │
│                                                                 │
│ 铁律 5: OSC CH1–4+GND（GND=stubLabel）；LA CH1–8+GND（禁CH0/D0）│
│   UART TX/RX/GND；FREQ IN/GND；SIGNAL_GEN OUT/GND               │
│                                                                 │
│ 铁律 6: 探针一律 joinByLabel；【SIM_CONN】有信号必有 GND/COM      │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 引脚解析规则（禁止硬编码）

```
优先级:
1. IComponentLibrary.getDeviceMeta(libDevId) → meta.data.pin_list[]
2. 按 pin_label 语义匹配 (参考 references/mcu-pin-maps.md)
3. 匹配顺序: 精确匹配 > 前缀匹配 > 语义别名匹配
4. 无 meta 时回退到 TemplateSchematicKit.pinOffset() 硬编码表
```

### 4.4 电源引脚连接规则

```
每个标记为 VDD/VCC/AVDD 的引脚 → 接入 VCC 网络
每个标记为 VSS/GND/AVSS 的引脚 → 接入 GND 网络
STM32 多个 VDD: 全部连接，每个就近配 C_100nF
STM32 VDDA: 经 0Ω/MAG_BEAD 接 VCC，配 C_10uF+C_100nF 到 VSSA
STM32 VCAP: 接 1uF 到 GND (如存在)
```

---

## 5. 连接策略（导线 vs 网络标号）

### 5.1 决策规则

```
同功能区器件间距 ≤ 150mil → joinWired (导线直连，WAR 正交绕障)
跨功能区/远距 > 150mil  → join / stubLabel (网络标号)
电源轨 (VCC/GND/3V3/5V) → 标号优先，就近可用短导线
晶振/去耦电容 → 必须导线（最短路径）
LED+电阻串联 → 导线（局部）
I2C/SPI/UART 总线 → 标号（跨区域）
仪器 (电压表/电流表/示波器) → 强制标号，禁止长导线
多脚网络 (>4引脚) → 标号，避免星形导线杂乱
局部拥塞 (>3线/格) → 标号
混合连接: 同一 net 允许既有导线又有标号
【硬】2～4脚无仪器小信号网优先 joinWired，并写入 forceWire，禁止整图几乎无导线
```

### 5.2 导线几何约束

与编辑器选中范围及 `DeviceHitGeometry` 对齐（常量：`SELECTION_HIT_PAD=14`，`FOREIGN_PIN_CLEARANCE=20`）。

```
1. 导线不得进入任何器件的「选中命中区」(符号包围盒 + HIT_PAD=14)
2. 导线距无关引脚 ≥20mil；接线仅允许本网引脚格+1格引出（禁止穿器件体）
3. 不同 net 导线不得正交交叉、不得共线重合/共享路径（PostGen 与 A* 共用 WireConflictGeometry）
4. 导线端点必须在引脚坐标 ±5mil 容差内
5. 最小转弯间距 ≥ 10mil (1 grid)
6. 禁止斜线 (仅正交 0°/90°)
7. 器件旋转/镜像后选中区 AABB 跟随变换
8. 不同 net 平行导线最小间距 ≥ 10mil
9. routeWaypoints / A* 路径不得落入任何器件选中区（含本网）；无法绕开则 joinByLabel
10. routeUntilClean：先剥离非 stub 旧线强制重布；多轮仍违规则自动降级标号+stub
11. T 型连接点由 UI 层添加 Junction Dot (非布线引擎职责)
12. 选型 critique 未过审不得静默放行（纠错轮次用尽仍有问题则中止生图）
13. route() 禁止把新布线段再追加进 existingRoutes 导致导线翻倍
14. NetPlanExecutor 执行前必须清空 wireList；takeDevice 仅精确 refName/libDevId
15. buildNetTasks：stub 已覆盖脚不入 A*；未覆盖脚≥2 仍布线（混合 joinWired+Label）
16. A* / 后验：任何器件选中区均禁止导线穿行（含本网/电源）；仅目标引脚格+1格正交邻格允许接线
17. 禁止 RAG/fuzzyFallback 静默替身选型；net_plan 执行 failures 生产中止
18. 编辑模式锁定现有器件 UUID，布局复用同型号实例，不全图重建
19. 【硬】同一引脚物理导线端点 ≤2；超出自动改 joinByLabel（NetPlan 规划 + routeUntilClean 后验）
```

### 5.5 互斥双色开关指示

```
用户要「打开绿灯 / 闭合红灯」类互斥指示时:
- 必须 RELAY_SPDT + SW_PUSH(驱动线圈) + LED_GREEN + LED_RED + 两颗限流电阻 + VCC + GND
- COM→GND；绿灯支路经 NC；红灯支路经 NO
- 禁止只用 SW_PUSH(SPST) 假装 SPDT
```

### 5.6 完整生图门禁

```
ercClean / 生图完成 当且仅当:
- ERC 阻断项 = 0（error/critical + 功能影响 warning，见 AiErcGateUtil）
- 几何 error = 0（wire_body / pin_proximity / wire_cross=正交交叉或共线重叠）
软性建议可保留: 去耦余量、入口电解、耐压余量、连线拥挤 warning
选型/net_plan critique 未过审 → 中止生图（禁止静默放行或 SemanticNetBuilder 生产回退）
```

### 5.3 网络标号约束

```
1. 标号名称全局唯一 (同 net 同名, 不同 net 不同名)
2. ★ 禁止电源名用于信号网 (v3.0 自动净化: addNet 检测信号网用保留名→追加_SIG后缀)
3. 保留名: VCC, VDD, GND, VSS, VEE, 3V3, 3.3V, 5V, 12V, -12V, AVCC, AGND, DGND
4. 纯标号网络必须至少有 1 段物理 stub 线
5. 标号位置不覆盖器件体或引脚
6. stubLabel 自动避让已有导线和引脚
7. ★ 每个 stub pin 必须有独立标号 (v3.0 邻脚不共享标号位置)
```

### 5.4 电源轨连接模式

```
VCC 符号 → 星形标号连接各 VDD 引脚
每个连接点: VCC 引脚 → stub(短引线) → VCC 标号
GND 同理
禁止长 VCC/GND 母线横穿整个电路（改用标号）
去耦电容就近导线接到对应 VDD 引脚
```

---

## 6. A* 布线

### 6.1 优先级排序

```
GND 网络:      priority = 10 (最先布线)
VCC/VDD 网络:  priority = 10
晶振/时钟网络:  priority = 9  (最短路径, 禁越模拟区)
模拟/ADC 网络:  priority = 7  (远离数字)
I2C/SPI 总线:  priority = 5  (等长平行)
GPIO 普通网络:  priority = 2
```

### 6.2 寻路参数

```
网格: 10mil
最大探索步数: 800 (超时则退化正交)
启发函数: 时钟网络 ×0.8 (偏好更直路径)
移动代价: 基准 gridSize, 时钟 ×0.5 (更激进直连), 禁绕 ×100 (禁绕过大)
邻居: 4方向正交 (45° 仅 I2C 等总线)
```

### 6.3 障碍物

```
器件选中区(HIT_PAD): buildObstacleMap 全量禁入（含本网，电源网同样禁止穿体）
已布导线: 逐段标记 (markRouteAsObstacle)
引脚接线: 仅目标引脚格 + 正交邻格(1 grid)可进入，禁止穿器件体引出
无法到达则 joinByLabel / demote stub（标号置于选中区外侧）
```

### 6.4 路径简化

```
删除共线中间点 (simplifyPath)
功率网络: ≤3 段 (直连或单弯)
晶振网络: ≤4 段 (fixViolations)
```

---

## 7. ERC 电气规则检查

### 7.1 致命错误 (ERROR) — 必须修复

| 规则 | 检测 | 修复 |
|------|------|------|
| LED 缺限流电阻 | LED 100mil 内无串联 R | 自动加 R_330 |
| VCC-GND 短路 | 同 net 含 VCC+GND 引脚 | 报告, 无法自动修复 |
| 运放开环 | OUT 无反馈到 IN- 或 IN+（含经 R/C） | 报告 |
| 导线穿器件 | 导线点在器件包围盒内 | A* 障碍物预防 |
| 不同 net 导线重合 | 两线共享坐标 | A* crossPenalty 预防 |
| 网络标号重名 | 不同 net 同名标号 | 重命名 |
| 信号网使用保留电源名 | 非电源 net 叫 VCC/GND | addNet 自动追加 _SIG 后缀 |
| ★ 器件完全浮空 | 器件无任何引脚连接 | 连接或移除 |
| ★ 电流表 I+/I- 同网 | 电流表两端在同一网络 | buildDividerChain 预防 |

### 7.2 严重警告 (WARNING) — 可能导致异常

| 规则 | 检测 | 修复 |
|------|------|------|
| 浮空 GPIO 输入 | 输入引脚无 pull-up/down/连接 | 加 R_10k |
| 多 VDD 未全连 | STM32 VDD 数 ≠ 已连接数 | 全部连接 |
| RST 浮空 | NRST 无连接 | 加 R_10k 上拉 |
| BOOT0 非 GND | STM32 BOOT0 接 VCC 或悬空 | 接 GND |
| 晶振无负载电容 | XTAL 脚无 C 到 GND | 自动加 C_22pF×2 |
| 晶振走线过长 | XTAL→MCU > 300mil | 布局时处理 |
| I2C 缺上拉 | SDA/SCL 无 R 到 VCC | 加 R_4.7k |
| 去耦电容不足 | VDD 数 > 去耦电容数 | 自动补 C_100nF |
| ★ GPIO 直连 VCC/GND | MCU IO引脚直接接电源轨 | 加限流电阻 |
| 扇出过载 | 1 GPIO 驱动 ≥4 负载 | 报告 |
| ★ 电流表 I+ 未接 VCC | 电流表不在电源回路 | 重新串联 |
| ★ 电流表 I- 未接负载 | 电流表无测量对象 | 重新串联 |
| ★ 多块电压表同节点 | N 块电压表测同一节点对 | 分发到不同节点 |
| ★ VCC-GND 间无负载 | 电源直通无电阻 | 加分压/负载电阻 |

### 7.3 建议 (INFO)

| 规则 | 修复 |
|------|------|
| 缺少大电容 | 电源入口加 C_10uF |
| GND 菊花链 | 改为星形 |
| 电阻值异常 | 检查范围 |
| 电容耐压不足 | 提升耐压 |

---

## 8. 仿真验证

### 8.1 验证流程

```
生成完成 → ERC (≥0 ERROR) → DC 工作点仿真 → 瞬态仿真 → 逻辑电平检查 → 报告
```

### 8.2 自动修复循环

```
仿真失败 → 分析原因 → 自动修复 (最多 3 轮) → 重新仿真 → 通过/收工
修复能力: 补去耦电容/上拉电阻/负载电容/限流电阻
无法修复: VCC-GND 短路, 器件完全不匹配, 拓扑结构错误
```

### 8.3 通过标准

```
- DC: VCC ≈ 3.3V(STM32) 或 5V(8051), GND = 0V
- DC: NRST ≈ VCC, BOOT0 = 0V
- 瞬态: 晶振起振 f≈标称值, 波形正弦
- 电平: VOH > 0.7VCC, VOL < 0.3VCC
- 无 floating_node 错误
```

---

## 9. 故障诊断与修复

### 9.1 诊断流程

```
1. 收集 ERC 违规
2. 跑 DC 仿真
3. 收集波形数据
4. 按严重度排序问题
5. 区分「确定问题」vs「待验证假设」
6. 生成修复建议
```

### 9.2 常见问题修复表

| 症状 | 根因 | 修复 |
|------|------|------|
| MCU 不工作 | 无电源/无时钟/无复位 | 检查 VCC/GND/XTAL/RST 连接 |
| LED 不亮 | 无限流电阻/反接 | R_330 串联, 检查 A/K 方向 |
| LED 烧毁 | 无限流电阻直连 VCC | 加 R_330 |
| 晶振不起振 | 无负载电容 | 加 C_22pF×2 到 GND |
| 串口不通 | TX/RX 没交叉 | TX→RX, RX→TX |
| I2C 不通 | 无上拉电阻 | R_4.7k×2 到 VCC |
| 运放输出饱和 | 开环/无反馈 | 加反馈电阻网络 |
| 仿真不收敛 | 浮空节点 | 所有节点有 DC 路径到 GND |
| 3.3V MCU 接 5V | 电平不匹配 | 加电平转换或换 5V 容忍引脚 |

---

## 10. 输出规范

### 10.1 拓扑结构

```typescript
interface SchTopology {
  schUuid: string;        // 原理图唯一 ID
  schName: string;        // 名称 = "AI: {用户输入前30字}"
  deviceList: DeviceInst[];  // 器件列表
  netList: NetNode[];        // 网络列表
  wireList: RouteLine[];     // 导线列表
  netLabelList: NetLabel[];  // 标号列表
  ercErrorList: ErcError[];  // ERC 错误列表
  layerDepth: number;        // 层级深度
  gridStep: number;          // 网格步进 = 10
  bgColor: string;           // 背景色 = "#FFFFFF"
}
```

### 10.2 命名规范

```
器件 refDes: R1,R2... (电阻) C1,C2... (电容) U1,U2... (IC/MCU) LED1... (LED) X1... (晶振)
网络名称: VCC(电源+), GND(电源-), NRST(复位), XTAL1/XTAL2(晶振), LED_CTRL(LED控制), SDA/SCL(I2C), UART_TX/UART_RX
标号文本: 与网络名称一致
```
