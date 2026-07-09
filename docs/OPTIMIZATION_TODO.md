# ElecDraw 全面深度优化 TODO 文档 v2.0

> 2026-07-08 第二轮全项目深度审计 | 40+ .ets 核心文件逐行审查 | 120 条新增优化建议

---

## 审计方法论

本轮审计对 7 大子系统核心实现文件进行了逐方法审查，重点关注：
- **正确性**：算法实现与理论模型的一致性
- **完整性**：外设模型、指令集、分析类型的覆盖度
- **鲁棒性**：边界条件、错误处理、资源限制
- **性能**：关键路径的算法复杂度与内存开销
- **可维护性**：模块边界、代码重复、接口清晰度

---

## 总览：子系统成熟度矩阵

| 子系统 | 核心文件 | 行数 | 成熟度 | 本轮新问题 |
|--------|---------|------|--------|-----------|
| simulation_kernel | 8 文件 | ~2200 行 | C+ | 20 条 |
| hex_debugger | 6 文件 | ~1600 行 | C | 20 条 |
| ai_engine | 5 核心文件 | ~2100 行 | B- | 20 条 |
| component_library | 1 核心文件 | 451 行 | B | 20 条 |
| file_persistence | 1 核心文件 | 734 行 | B+ | 20 条 |
| schematic_editor + entry | 3 核心文件 | ~2600 行 | B+ | 20 条 |
| common 基础层 | ~40 工具文件 | ~5000 行 | B- | 20 条 |

---

## 一、仿真内核（simulation_kernel）— 20 条深度优化建议

### 1.1 RC 网络求解器升级为 MNA 矩阵

**文件**：`features/simulation_kernel/src/main/ets/engines/AnalogEngine.ets`

**现状**：`solveRcNetwork(dt)`（~L120）使用简化的单时间常数 RC 充电模型 `Vc += (Vfinal - Vc) * (1 - exp(-dt/tau))`。`findSeriesResistance()` 仅查找单条路径，无法处理并联电阻网络或多源电路。

**建议**：
1. **实现 Modified Nodal Analysis (MNA)**：构建 G·V = I 线性方程组，使用 LU 分解求解节点电压。这是 SPICE 的核心算法，当前 RC 模型无法处理含运放、晶体管、多电源的实际电路。
2. **添加独立电压源处理**：MNA 需要扩展矩阵处理电压源（当前 `solveDC()` 假设所有源 = 0）。
3. **实现稀疏矩阵存储**：电路矩阵通常 >90% 为零，稀疏存储可将 100 节点矩阵从 10KB 降至 ~2KB。
4. **添加 Newton-Raphson 迭代**：非线性器件（二极管、BJT）需要多次迭代直至收敛。当前 `getLastConverged()` 总是返回 true。
5. **实现器件模型库**：添加二极管（Shockley 方程）、BJT（Gummel-Poon 简化）、MOSFET（Level 1）的解析模型。

### 1.2 数字引擎时序模型

**文件**：`features/simulation_kernel/src/main/ets/engines/DigitalEngine.ets`

**现状**：`evalGateOutput()` 零延迟输出。74HC 系列 tPLH/tPHL 典型值 7-15ns，当前仿真完全不考虑。

**建议**：
6. **添加传播延迟模型**：`LogicGate` 添加 `tPLH_ns: number` 和 `tPHL_ns: number` 字段，事件调度使用当前时间 + 延迟。
7. **实现 setup/hold 时序检查**：对于 D 触发器（74HC74/595），在时钟沿检查数据稳定时间。
8. **添加扇出负载模型**：每个输出驱动的门数影响实际延迟（扇出 1→10 可能增加 2-3ns）。
9. **实现最小脉冲宽度过滤**：窄于 2ns 的毛刺应被门电容过滤，不应传播。
10. **竞争冒险路径信息增强**：当前 `hazardPaths` 仅记录 toggle 计数，应输出具体信号路径（"U1.Q → U2.A → U3.Y"）。

### 1.3 混合信号耦合

**文件**：`features/simulation_kernel/src/main/ets/SimulationKernelImpl.ets`

**现状**：模拟域（AnalogEngine）和数字域（DigitalEngine）完全独立运行，无互相影响。MCU 引脚通过 `syncMcuPinToSpice/syncSpiceToMcuAdc` 桥接，但数字门输出不反馈到模拟域。

**建议**：
11. **实现 A/D 接口模型**：数字引脚输出应建模为 Thevenin 等效（电压源 + 输出阻抗），连接到模拟节点。
12. **实现 D/A 阈值检测**：模拟节点电压跨过 VIL/VIH 阈值（0.8V/2.0V for 5V CMOS）时触发数字事件。
13. **添加电源完整性基础检查**：数字门同时翻转时，VCC/GND 上的 di/dt 噪声影响模拟域参考电压。
14. **统一时间轴**：当前三个引擎各自独立 tick，应建立全局事件队列按时间排序统一推进。

### 1.4 高级分析类型

**文件**：`features/simulation_kernel/src/main/ets/engines/SpiceRunner.ets`

**现状**：`runNoise()`（L66-74）噪声底仅基于频率计算数学值，不基于器件物理。`runTF()`（L76-86）仅用 2 个频率点近似传递函数。

**建议**：
15. **实现器件噪声模型**：电阻热噪声（4kTR）、MOSFET 闪烁噪声（1/f）、BJT 散粒噪声。
16. **runTF() 使用 AC 扫频**：应在 10Hz-10MHz 对数间隔扫描 100 点，而非仅 1kHz 和 10kHz 两点。
17. **添加 .pz（零极点）分析**：通过求解状态空间矩阵特征值获取系统零极点。
18. **添加 .disto（失真）分析**：FFT 分析输出谐波成分，计算 THD。
19. **添加 .sens（灵敏度）分析**：计算输出对每个器件参数的偏导数。

### 1.5 QEMU 桥接真实性

**文件**：`features/simulation_kernel/src/main/ets/engines/QemuMcuBridge.ets`

**现状**：`step(cycles)`（L32-38）仅 `this.state.pc += 2 * cycles`，`processHandle` 使用 `Date.now()` 模拟。外设寄存器读写仅存储值，无外设行为。

**建议**：
20. **QEMU 子进程启动与通信**：通过管道或共享内存与 QEMU 进程通信，至少实现 register read/write 协议。当前骨架在生产环境完全不可用，是项目最关键的 P0 阻塞项。

---

## 二、HEX 调试器（hex_debugger）— 20 条深度优化建议

### 2.1 Cortex-M3 指令集覆盖率

**文件**：`features/hex_debugger/src/main/ets/engines/CortexM3Core.ets`

**现状**：`step()`（L42-89）仅解码 ~15 条 Thumb 指令（B cond/LDR lit/ADD imm/MOV/STR/LDR/PUSH/POP/SUB/AND/ORR/CMP/NOP/BL 32-bit）。Thumb-2 指令集约 150+ 条，当前覆盖率 < 10%。

**建议**：
1. **补全数据处理指令**：MUL、MLA、UMULL、SDIV、UDIV、REV、RBIT、CLZ、SXTB/UXTB 等。
2. **补全 Load/Store 指令**：LDRB/STRB、LDRH/STRH、LDRSB/LDRSH、LDMIA/STMIA、PUSH/POP 多寄存器变体。
3. **补全分支指令**：BLX register、CBZ/CBNZ、IT 条件块。
4. **添加 MSR/MRS 指令**：访问 CONTROL/PRIMASK/FAULTMASK/BASEPRI 特殊寄存器。
5. **实现异常入口/退出序列**：硬件自动压栈 R0-R3/R12/LR/PC/xPSR，从向量表取 ISR 地址。

### 2.2 外设模型

**文件**：`features/hex_debugger/src/main/ets/engines/CortexM3Core.ets`、`McuBehaviorSimulator.ets`

**现状**：CortexM3Core 无任何外设（NVIC、SysTick、MPU）。McuBehaviorSimulator 仅模拟 IO 模式和时钟源选择，无实际外设行为。

**建议**：
6. **实现 NVIC**：支持 16 个系统异常 + 最多 240 个外部中断，优先级分组，pending/active 状态。
7. **实现 SysTick**：24 位递减计数器，到达 0 时触发 SysTick 异常，自动重装载。
8. **实现 GPIO 外设**：CRL/CRH 配置寄存器，IDR/ODR 数据寄存器，BSRR 位操作。
9. **实现 USART 外设**：波特率发生器、SR 状态寄存器、DR 数据寄存器、发送/接收中断。
10. **实现定时器外设**：TIM2-TIM5 通用定时器，预分频器、自动重装载、捕获/比较通道。

### 2.3 8051 指令完整性与工具链

**文件**：`common/src/main/ets/engines/Mcu8051Engine.ets`

**现状**：实现了 ~60+ 条指令。8051 完整指令集 111 条（含所有寻址模式变体）。

**建议**：
11. **审计缺失指令**：MOVX @Ri（间接外部 RAM）、JMP @A+DPTR、未实现的位操作变体。
12. **修复寄存器组切换**：`getReg()`（L172-178）在 bank > 0 时使用 `R${bank}${idx}` 键名，但 reset() 仅设置 R0-R7。bank 切换后 regs map 缺少对应键。
13. **实现中断向量跳转**：`interruptPending` 被设置但从未触发 ISR 向量（0x0003/0x000B/0x0013/0x001B/0x0023）。
14. **实现串口模式 1/2/3**：当前仅基础模式 0。需要波特率发生器（Timer1 溢出）和接收时序。
15. **添加电源模式**：IDLE（停止 CPU，外设运行）和 PDOWN（停止全部，仅复位唤醒）。

### 2.4 调试器高级功能

**文件**：`features/hex_debugger/src/main/ets/HexDebuggerImpl.ets`

**现状**：基本单步/断点/观察点功能存在，但缺少专业调试器的关键能力。

**建议**：
16. **添加调用栈回溯**：8051 路径仅维护 `callStackDepth` 计数器，Cortex 路径有 `callStack` 列表。8051 应同样支持完整调用栈（存储返回地址列表）。
17. **添加指令历史追踪**：环形缓冲区记录最近 1000 条执行指令（PC + 反汇编文本），支持回溯。
18. **实现硬件断点模拟**：Cortex-M 有 6 个硬件断点（FPB 单元），应在 0xE0002000 地址空间模拟。
19. **runToBreakpoint() 步数限制可配置**：当前硬编码 100000（L196），大型程序可能需要更多。应作为 McuDebugConfig 参数。
20. **添加外设寄存器视图**：按外设分组显示寄存器（GPIOA→CRL/CRH/IDR/ODR），当前 `get51Sfr()` 仅返回扁平列表。

---

## 三、AI 引擎（ai_engine）— 20 条深度优化建议

### 3.1 LLM 调用鲁棒性

**文件**：`features/ai_engine/src/main/ets/algorithms/AiPipelineOrchestrator.ets`

**现状**：LLM 调用失败时静默降级到本地逻辑。没有重试、没有降级日志、没有用户提示。

**建议**：
1. **添加 LLM 调用重试**：指数退避重试 2 次（1s/2s），区分网络错误（可重试）和配额错误（不可重试）。
2. **降级时通知用户**：`degradedMode` 标记应通过 EventBus 发布 UI 提示（"AI 服务不可用，已使用本地算法"）。
3. **添加 LLM 响应质量评分**：检查返回 JSON 的字段完整性，部分字段缺失 > 50% 时拒绝并使用本地降级。
4. **约束缓存添加 TTL**：`constraintCache`（L44）无过期机制。同一 prompt 5 分钟后应重新请求（电路需求可能已变化）。
5. **并行化独立 LLM 请求**：`fetchDeviceSelectLlm()` 和 `fetchLayoutLlm()` 可并行发起，当前串行等待。

### 3.2 布局优化算法深度

**文件**：`features/ai_engine/src/main/ets/algorithms/PlacementOptimizer.ets`

**现状**：GA 算法框架完善（种群 60 × 50 代），但适应度函数和约束处理有提升空间。

**建议**：
6. **适应度权重可配置化**：当前 `fitness()`（L236-263）硬编码 0.4/0.25/0.2/0.15，不同电路类型（数字/模拟/RF）需要不同权重。
7. **添加拥挤度距离计算**：NSGA-II 风格的多目标优化，避免种群过早收敛到局部最优。
8. **交叉操作使用模拟二进制交叉（SBX）**：当前单点交叉（L409-421）不保留父代优良模式。
9. **添加增量适应度评估**：仅重评估受变异影响的局部器件对，而非每次全量 O(n²) 计算。
10. **GA Worker 结果验证**：`optimizeAsync()` 返回的 `workerOut.bestGenes` 应在主线程验证合法性（坐标范围、旋转角度）。

### 3.3 布线引擎完善

**文件**：`features/ai_engine/src/main/ets/algorithms/ConstrainedWiringEngine.ets`

**现状**：A* 寻路 + 直角走线 + 障碍避让。缺少差分对和总线布线的专业支持。

**建议**：
11. **差分对等长约束**：`checkDiffEqualLength()` 仅检查长度差 < 30 格，应实现主动绕蛇形线（serpentine）补偿。
12. **添加过孔（Via）支持**：多层板需要层间切换。当前所有走线在同一层。
13. **A* 搜索添加方向偏好**：优先水平-垂直交替，减少不必要的拐角。当前 `heuristic()` 使用 Manhattan 距离无方向权重。
14. **添加布线拥塞代价图**：高密度区域增加惩罚权重，引导走线分散。
15. **修复电源网络直连**：`isBlocked()`（L271）对电源网络跳过器件阻挡，这可能导致 VCC 穿过芯片。

### 3.4 器件选择与知识库

**文件**：`features/ai_engine/src/main/ets/algorithms/DeviceSelectEngine.ets`

**现状**：四层匹配（exact→semantic→domestic→fuzzy）逻辑正确，但 RAG 知识库和 pin 兼容性检查欠缺。

**建议**：
16. **RAG 知识库扩展**：`RagKnowledgeBase.search()` 当前仅返回模板匹配。应嵌入向量相似度搜索或至少 TF-IDF 关键词加权。
17. **添加 Pin-to-Pin 兼容性检查**：选型结果应验证替代器件的引脚排列与原型一致（VCC/GND 位置、IO 数量）。
18. **添加工作电压范围校验**：`checkMcuFirmware()` 仅检查 flash 大小。应验证工作电压（3.3V vs 5V）、封装、温度范围。
19. **`buildLocalLlmOutput()` 模板扩充**：当前仅识别 4 种关键词模式（stm32/51/lcd/led）。应覆盖运放、电源、传感器等常见场景。
20. **器件替代缓存**：`findAlternatives()` 每次全量语义搜索。应缓存常用替代关系（如 78M05→AMS1117-5.0）。

---

## 四、器件库（component_library）— 20 条深度优化建议

### 4.1 搜索与索引优化

**文件**：`features/component_library/src/main/ets/ComponentLibraryImpl.ets`

**现状**：倒排索引 + 拼音搜索已实现。但 `semanticSearch()`（L205-234）仍遍历全量组件（O(n*m) per query）。

**建议**：
1. **semanticSearch 也使用倒排索引**：对 query 的每个 token 查 invertedIndex 取并集，而非全量扫描 `all`。
2. **添加 BM25 排序算法**：当前 `score++` 的简单计分对常见词（如 "电阻"）不降权。
3. **索引 N-gram 支持拼写容错**：3-gram 索引可匹配 "AT89C51" ← "AT8951" 等常见笔误。
4. **索引重建改为增量**：`indexDirty = true` 时全量重建整个索引。器件添加/删除应只更新相关 token。
5. **添加索引序列化**：启动时无需每次重建倒排索引，可缓存到文件。

### 4.2 器件元数据完整性

**文件**：`features/component_library/src/main/ets/ComponentLibraryImpl.ets`、`DeviceLibraryLoader`

**现状**：`DeviceMeta` 类型存在但很多字段未填充。`getDeviceMeta()` 对内置器件返回 `DeviceLibraryLoader` 结果（可能失败）。

**建议**：
6. **完善内置器件元数据**：所有 `BuiltinComponents` 应附带完整的 `DeviceMeta`（pin_list、param_limit、erc_check_rules）。
7. **添加器件封装信息**：`DeviceMeta` 应包含封装名（0805/SOT-23/QFP-48）、3D 模型路径。
8. **添加数据手册 URL**：`datasheet_url: string`，用户在属性面板可点击查看。
9. **添加器件生命周期状态**：Active/NRND（不推荐新设计）/Obsolete，帮助 BOM 优化。
10. **添加 RoHS/环保合规标记**：`rohs_compliant: boolean`，BOM 导出时标注。

### 4.3 器件库管理

**文件**：`features/component_library/src/main/ets/ComponentLibraryImpl.ets`

**建议**：
11. **实现器件版本管理**：修改器件定义时应保留旧版本，支持回滚。当前 `batchUpdateParams()` 直接覆盖。
12. **添加器件使用统计**：记录每个器件的使用次数，帮助排序搜索结果（常用来器件优先展示）。
13. **实现库自检功能**：检查所有引用的 SPICE 模型/符号文件是否存在，报告损坏的器件。
14. **添加器件收藏夹**：用户可标记常用器件到收藏列表，快速访问。
15. **支持自定义分类标签**：当前分类固定为 10 个枚举值，用户应可创建自定义标签（如 "电源管理"、"射频"）。

### 4.4 性能与资源

**建议**：
16. **实现 SVG 符号延迟加载**：当前构造时加载所有内置组件符号。大型库按需加载。
17. **添加搜索防抖**：`search()` 每次按键触发全量检索，应 debounce 300ms。
18. **实现分页游标**：当前 `search(keyword, page, pageSize)` 使用 `slice(start, start+pageSize)`，每次重建全量过滤列表。应用游标缓存。
19. **添加缩略图预生成**：第一页结果在后台预渲染缩略图，hover 时即时显示。
20. **参数搜索支持 OR 逻辑**：当前范围搜索（"10k~100k"）是 AND，应支持 "10k,100k,1M" 多值 OR 搜索。

---

## 五、文件持久化（file_persistence）— 20 条深度优化建议

### 5.1 文件格式与完整性

**文件**：`features/file_persistence/src/main/ets/FilePersistenceImpl.ets`

**现状**：SHA-256 完整性校验 + section hash 增量保存已实现。格式设计有提升空间。

**建议**：
1. **添加文件格式魔数**：`.schsim` 文件头 4 字节应为固定魔数（如 `0x53434853` = "SCHS"），快速识别文件类型。
2. **添加向前兼容标记**：`version` 字段用于迁移逻辑。应记录 `minReaderVersion`，旧版本打开新格式时明确提示升级。
3. **section hash 比较改为内容 hash**：当前 `mapAwareStringify(data.topology as ESObject)` 可能因字段顺序变化产生不同 hash。应使用确定性序列化算法。
4. **添加压缩存储选项**：大型工程（100+ 器件）JSON 可能 >500KB。可选 DEFLATE 压缩，存储为 `.schsim.gz` 或内嵌压缩标记。
5. **projectDataToLegacy 保存时执行完整同步**：当前 `saveProject()` 从 `ProjectFile` 构建 `ProjectData`，每次 save 都重新做 TopologyAdapter 转换，浪费 CPU。

### 5.2 备份与恢复

**文件**：`features/file_persistence/src/main/ets/FilePersistenceImpl.ets`

**建议**：
6. **自动备份添加数量上限**：`enableAutoBackup()` 无文件数限制。应保留最近 10 个 + 每小时 1 个 + 每天 1 个的三级策略。
7. **备份添加元数据索引**：生成 `backup_index.json` 记录每个备份的时间戳/版本/器件数，加速恢复选择。
8. **添加崩溃恢复检测**：启动时检查 `RECOVERY_DIR` 是否存在未正常关闭的恢复文件，提示用户恢复。
9. **autosave 增加肮标记**：仅当文档实际变更时才写入，当前定时器无条件 save。
10. **实现事务性保存**：先写入 `.tmp` 文件，成功后再原子重命名为正式文件，防止写入中断导致文件损坏。

### 5.3 第三方格式互操作

**文件**：`features/file_persistence/src/main/ets/parsers/`

**建议**：
11. **ProteusParser 解析 XML 节点属性**：Proteus .sch 使用 XML 格式，应解析器件的 `primitive`/`part_name`/`value`/`origin` 属性。
12. **KiCadParser 符号库映射**：KiCad 器件使用符号库引用（如 `Device:R`），需要映射表转换到 ElecDraw 器件 ID。
13. **LtspiceParser 子电路展开**：LTspice .asc 中 `.lib`/`.include` 引用的子电路应递归展开。
14. **添加 Altium/AD 格式解析器**：Altium SchDoc 是行业最常用格式之一，应为中期目标。
15. **导入报告增强**：`ImportReport` 当前仅统计计数，应列出无法映射的器件清单和映射建议。

### 5.4 导出功能

**建议**：
16. **PNG 导出添加 DPI 控制**：当前 `TopoPngExporter` 使用固定分辨率。应支持 72/150/300 DPI 选项。
17. **SVG 导出添加 CSS class**：线条/器件/文本应有 class 属性，方便后处理。
18. **PDF 导出添加书签与元数据**：工程名称/日期/页码作为 PDF 元数据嵌入。
19. **Netlist 导出支持多种格式**：当前仅简单 SPICE 格式。应支持 Tango/Protel/Pads 网表格式。
20. **添加 Gerber 预览导出**：虽不直接做 PCB，但应能导出各层图形到独立文件供 PCB 工具参考。

---

## 六、原理图编辑器与 UI（schematic_editor + entry）— 20 条深度优化建议

### 6.1 编辑器数据结构

**文件**：`features/schematic_editor/src/main/ets/SchematicEditorImpl.ets`（1728 行）

**现状**：编辑器架构扎实（命令模式、undo/redo、layers、annotations），但过于庞大。

**建议**：
1. **拆分 SchematicEditorImpl**：将 Annotation 管理（~150 行）、Probe/Bus 管理（~100 行）、Selection 管理（~100 行）抽取为独立委托类。
2. **CommandHistory 添加内存上限**：当前无大小限制。1000 步单器件操作 ≈ 20MB，应限制最大条目数（500）并按需裁剪旧条目。
3. **实现空间索引加速 hitTest**：`hitTestAt()` 线性扫描所有组件。器件 > 200 时应有 R-Tree 或网格分桶索引。
4. **`cloneDoc()` 改为 true 深拷贝**：当前通过 `mapAwareStringify + mapAwareParse` 的 JSON 往返可能有精度损失（浮点数）和性能问题。应使用结构化克隆。
5. **选择模型扩展**：支持 Net 选择模式（点击导线选中整条网络）、Pin 选择模式（点击引脚选中并可在属性面板编辑）。

### 6.2 画布渲染

**文件**：`entry/src/main/ets/components/SchematicCanvas.ets`

**建议**：
6. **实现真正的脏矩形重绘**：当前 `invalidateSceneSnapshot()` 使整个快照失效。拖拽时应只重绘移动器件的新旧位置区域。
7. **线宽自适应缩放**：导线在缩小时应保持最小可见线宽（≥1px），放大时按比例增加。当前固定线宽。
8. **添加渲染分级（LOD）**：缩放 < 50% 时隐藏器件文本标注，< 25% 时使用填充矩形代替 SVG 符号。
9. **导线连接点（Junction）渲染**：T 型交叉和十字交叉应自动绘制实心圆点（直径 6px），区分连接和跨线。
10. **网格渲染性能退化**：`gridTile` 在缩放变化时需重建。可改为 GPU shader 风格的屏幕空间网格（shader 2 行代码 vs 数千次 fillRect）。

### 6.3 交互体验

**建议**：
11. **添加右键上下文菜单**：当前右键仅清除选择。应弹出菜单（删除/旋转/镜像/属性/复制）。
12. **添加测量工具**：M 键激活测量模式，点击两点显示距离（ΔX/ΔY/欧氏距离），参考 KiCad。
13. **添加自动连线预览**：鼠标悬停在引脚上时，半透明显示 A* 计算的到最近未连接引脚的推荐路径。
14. **电阻/电容值可视化编辑**：双击器件直接在画布上显示输入框，而非跳转到属性面板。
15. **元件放置时显示半透明符号预览**：`placementPreview` 当前仅显示十字线，应渲染实际 SVG 符号半透明跟随鼠标。

### 6.4 UI 架构

**文件**：`entry/src/main/ets/pages/Index.ets`

**建议**：
16. **Index.ets 拆分**：当前 200+ 行 `aboutToAppear()` 中的初始化逻辑应移至 `AppViewModel.initAsync()`。
17. **实现面板布局持久化**：用户面板折叠状态/宽度应存储到 preferences，重启后恢复。
18. **添加快捷键提示面板**：长按 Ctrl 显示半透明叠加层，列出当前上下文可用快捷键。
19. **添加状态栏详细信息**：当前仅显示文本消息。应添加仿真进度条、MCU 频率指示、选中器件数。
20. **支持多窗口/多页**：同一工程的多张原理图（层次设计）以 Tab 切换，当前仅单页。

---

## 七、common 基础层 — 20 条深度优化建议

### 7.1 类型系统

**文件**：`common/src/main/ets/types/CommonTypes.ets`、`TopologyTypes.ets`

**建议**：
1. **统一 v1/v2 类型迁移计划**：当前 `TopologyAdapter` 双向转换存在字段丢失风险。应制定 v1→v2 完全迁移时间表，逐步废弃 v1 类型。
2. **Map 类型改为 Record 或自定义可序列化 Map**：`MapJsonUtil` 是补丁方案。长期应使用实现了 `toJSON()` 的 `SerializableMap<K,V>` 类。
3. **添加类型严格空安全检查**：`DeviceInst.params` 可为 undefined，但多处代码直接 `.get()` 未做空检查。
4. **接口拆分减少 God Object**：`SchTopology` 包含 15 个字段，分为 `SchTopologyMeta`（schUuid/schName/layerDepth/bgColor）、`SchTopologyBody`（deviceList/netList/wireList）、`SchTopologyAux`（probeList/ercErrorList/textAnnotate）。
5. **添加 JSON Schema 验证**：工程文件加载后应对 topology/simConfig 做 schema 校验，而非信任输入。

### 7.2 公共工具

**建议**：
6. **EventBus 添加事件日志**：调试模式下记录最近 100 条事件的 source/event/timestamp，面板可查看事件流。
7. **EventBus 添加优先级队列**：ERC 错误事件应优先于 UI 更新事件处理。
8. **Logger 添加日志级别控制**：当前无级别过滤。应有 `setLogLevel(LogLevel.WARN)` 在生产环境屏蔽 DEBUG/INFO。
9. **Logger 添加文件输出**：将日志持久化到文件，支持崩溃后分析。使用环形缓冲区防止磁盘写满。
10. **Validate 工具扩展**：添加 `validateRange(n, min, max)`、`validateEmail()`、`validateUrl()`、`validateNonEmptyArray()`。

### 7.3 8051 共享引擎

**文件**：`common/src/main/ets/engines/Mcu8051Engine.ets`（413 行，全部 static 方法）

**建议**：
11. **按指令类别拆分**：将 400+ 行的 `Mcu8051Engine` 拆分为 `Mcu8051Arithmetic`、`Mcu8051Control`、`Mcu8051Bitwise`、`Mcu8051Timer`、`Mcu8051Uart` 等模块。
12. **添加指令周期计数**：每条指令应记录机器周期数（1/2/4），累计传给 `totalCycles` 字段用于精确时序。
13. **timer 重载模式修复**：`mode0 === 2` 时 reload 值应仅为 TH0（8 位自动重载），当前计算有误。
14. **UART 接收缓存**：当前仅 TX，无 RX 缓冲。应实现环形接收 FIFO。
15. **添加 WDT（看门狗定时器）**：8052 变体的独立看门狗，溢出触发复位。

### 7.4 ERC 与验证

**文件**：`common/src/main/ets/utils/ErcEngine.ets`、`DeepErcEngine.ets`、`DynamicErcEngine.ets`

**建议**：
16. **合并三个 ERC 引擎**：`ErcEngine`（函数式规则）、`DeepErcEngine`（位置感知）、`DynamicErcEngine`（波形分析）职责重叠。应统一为 `ErcEngine.run(schematic, mode: 'static'|'deep'|'dynamic')`。
17. **ERC 规则可配置化**：将硬编码规则提取为 JSON 配置文件，用户可禁用特定规则或调整严重度。
18. **添加 ERC 批量修复**：`autoFixERC()` 当前仅处理 5 种模式。应建立 `[规则→修复动作]` 映射表。
19. **ERC 结果增量更新**：修改一个器件不需要重新跑全图 ERC。仅检查受影响的网络和连接器件。
20. **添加 ERC 可视化标记**：在画布上错误位置显示红色 X 标记，hover 显示错误详情。当前仅有列表文本。

---

## 八、新增 Sprint 规划

### Sprint 7-9：仿真真实性（P0 阻塞）
- QEMU 子进程通信协议（1.5.20）
- AnalogEngine MNA 矩阵求解器（1.1.1-1.1.5）
- 混合信号耦合框架（1.3.11-1.3.14）
- CortexM3 指令集覆盖率提升至 60%（2.1.1-2.1.5）

### Sprint 10-12：外设与调试（P1 高优）
- NVIC/SysTick/GPIO/USART/TIM 外设模型（2.2.6-2.2.10）
- 8051 中断向量与串口模式（2.3.11-2.3.15）
- ERC 引擎合并与规则配置化（7.4.16-7.4.18）
- LLM 调用重试与降级通知（3.1.1-3.1.3）

### Sprint 13-15：UI/UX 与 AI 深化（P2 中优）
- 画布 LOD 渲染与脏矩形优化（6.2.6-6.2.8）
- 编辑器空间索引加速（6.1.3）
- 布局 GA 算法权重可配置化（3.2.6-3.2.10）
- 差分对等长布线（3.3.11-3.3.12）

### Sprint 16-18：生态与发布（P2/P3）
- Altium/KiCad 符号库映射（5.3.11-5.3.14）
- 器件元数据完善与数据手册链接（4.2.6-4.2.10）
- BOM 导出增强 + 封装信息（4.2.6）
- 备份三级策略 + 事务性保存（5.2.6-5.2.10）

---

## 九、验收门禁 v2.0

| 编号 | 测试场景 | 验收标准 | 阻塞级别 |
|------|---------|---------|---------|
| AC-01 | RC 低通滤波器 MNA 瞬态仿真 | 与 LTspice 波形 RMS 偏差 < 1% | P0 |
| AC-02 | 共射放大电路 DC 工作点 | Vce/Ic 与理论值偏差 < 5% | P0 |
| AC-03 | AT89C51 LED 500ms 闪烁 | P1.0 波形周期误差 < 1% | P0 |
| AC-04 | STM32F103 定时器中断 | 中断频率误差 < 0.1% | P0 |
| AC-05 | QEMU 桥接 STM32 USART | 115200bps 发送 100 字节无丢失 | P0 |
| AC-06 | 100 器件画布视口剔除 | 平移/缩放 ≥ 30fps | P0 |
| AC-07 | LLM 幻觉拦截 | 虚构器件 100% 被 oodFlags 捕获 | P1 |
| AC-08 | HEX 损坏拒载 | 校验和错误 → ERR_HEX_PARSE_FAIL | P1 |
| AC-09 | 工程篡改拒绝 | 校验不匹配 → 明确提示 | P1 |
| AC-10 | 500 步撤销 | 内存增长 < 50MB，单步 < 50ms | P1 |
| AC-11 | 10 器件 AI 全流程 | 选型→布局→布线→ERC 闭环 < 30s | P2 |
| AC-12 | 交叉格式互操作 | Proteus .sch 导入器件匹配率 > 80% | P2 |

---

*文档版本: 2.0 | 审计日期: 2026-07-08 | 第二轮全项目深度代码审查*
*共计 140 条可执行优化建议，覆盖 7 大子系统*
