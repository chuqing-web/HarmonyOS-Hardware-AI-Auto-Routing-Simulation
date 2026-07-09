# AI 驱动选型 · 摆放 · 布线闭环方案

> 版本 1.0.0 | LLM 逻辑推理 + 本地算法几何/电气强制执行  
> 适配 51 / STM32 单片机原理图仿真

---

## 一、双分层总架构

```
用户输入 / 空白原理图
    │
    ▼
┌─────────────────────────────────────┐
│  LLM 层（ai_api_manager + Prompt）   │  只输出：功能模块、参数区间、约束规则
│  禁止输出：坐标、线路点、编造型号      │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
选型引擎    布局 GA      约束 A*
(DeviceSelect) (Placement) (ConstrainedWiring)
    │          │          │
    └──────────┼──────────┘
               ▼
        ERC + 可选 AI 二次修复
               ▼
     schematic_editor 画布回写
               ▼
        simulation_kernel 仿真闭环
```

**幻觉隔离原则**：LLM 仅产出 JSON 约束；`lib_dev_id` 匹配、坐标迭代、路径拐点均由本地可信模块完成。

---

## 二、代码模块对照

| 能力 | 文件 | 模块 |
|------|------|------|
| 全闭环编排 | `ai_engine/.../AiPipelineOrchestrator.ets` | ai_engine |
| 四层选型 | `ai_engine/.../DeviceSelectEngine.ets` | ai_engine + component_library |
| RAG 模板库 | `ai_engine/.../RagKnowledgeBase.ets` | ai_engine |
| GA 布局 | `ai_engine/.../PlacementOptimizer.ets` | ai_engine |
| 约束 A* 布线 | `ai_engine/.../ConstrainedWiringEngine.ets` | ai_engine |
| Prompt 模板 | `ai_prompt_lib/*.json` + `PromptLoader.ets` | ai_engine |
| 画布回写 | `schematic_editor.applyRouteResult()` / `loadTopology()` | schematic_editor |
| API 调度 | `AiApiManagerImpl` | ai_api_manager |

### 新增 AiTaskType

| 枚举 | 说明 |
|------|------|
| `TASK_DEVICE_SELECT` | 仅选型四层校验 |
| `TASK_LAYOUT_PLACE` | 选型 + GA 摆放 |
| `TASK_FULL_PIPELINE` | 选型 → 摆放 → 布线 → ERC |

---

## 三、器件选择四层链路

### 阶段 1：LLM 语义拆解

- Prompt：`ai_prompt_lib/device_select.json`
- 输出：`DeviceSelectLlmOutput`（`function_module` / `device_require_list` / `circuit_constraint` / `oodFlags`）
- OOD 标记 → 终止生成，弹窗推荐替代

### 阶段 2：本地库检索（防幻觉核心）

`DeviceSelectEngine.matchFromLlmOutput()`：

1. **精准型号**：`explicitModel` → `IComponentLibrary.getComponent()`
2. **语义模糊**：`semanticSearch()` + `param_limit` 过滤
3. **国产替代**：`DOMESTIC_ALT` 映射表（如 STM32F103 → GD32F103）

### 阶段 3：参数校验

- 对比 `meta.json` 的 `param_limit`
- STM32 自动补去耦电容参数
- 51 P0 推荐上拉电阻

### 阶段 4：RAG 兜底

- `RagKnowledgeBase`：stm32_min_sys / 51_min_sys / lcd1602_periph
- 无 LLM 或 API 失败时 `buildLocalLlmOutput()` 降级

---

## 四、器件摆放（LLM 约束 + GA）

### LLM 输出 CCG（`LayoutLlmOutput`）

- `module_group`：电源 / MCU / 外设分组
- `constraint_rules`：adjacent / separate / central / edge
- **禁止坐标**

### GA 优化（`PlacementOptimizer`）

| 评价项 | 权重 |
|--------|------|
| 关键器件邻近度 | 40% |
| 模块分区隔离 | 25% |
| 信号线总长度 | 20% |
| 重叠惩罚 | -50% |
| 高频隔离 | 15% |

- 种群 60，迭代 50 代，输出 Top3 候选
- 后处理：`applyMcuHardRules()` 晶振/去耦/复位就近

### 人机模式

- `TASK_FULL_PIPELINE`：全局一键
- `TASK_LAYOUT_PLACE` + `lockedUuids`：局部优化，锁定器件不移动

---

## 五、自动布线（LLM 优先级 + A*）

### LLM 输出（`RoutingLlmOutput`）

- `net_priority`：GND/VCC=10, XTAL=9, I2C=8, ADC=7, GPIO=2
- `special_net_rules`：最短路径 / 等长 / 45° 等
- **禁止坐标点**

### 本地 A*（`ConstrainedWiringEngine`）

1. 按优先级排序网络
2. 构建器件障碍地图
3. 加权代价：长度 + 交叉惩罚 + 模拟数字隔离 + 晶振最短
4. `fixViolations()`：时钟线简化、电源直连

### 回写

```typescript
schematicEditor.applyRouteResult(routeResult, true); // keepManualRoute=true
```

---

## 六、51/STM32 硬约束

### 摆放

| 规则 | 实现 |
|------|------|
| MCU 居中 | `applyMcuHardRules()` |
| 晶振紧贴 XTAL | adjacent 约束 weight=100 |
| 去耦贴 VDD | 电容偏移 (mcu.x+60, mcu.y-40) |
| 功率远离 ADC | separate minDistance=150 |

### 布线

| 规则 | A* 代价 |
|------|---------|
| 晶振最短 | `xtalShortPath` 权重 ×0.5 |
| 电源最高优先级 | priority=10，先布 |
| I2C 等长 | `diffEqualLength` 检测 |
| ADC 远离 PWM/CLK | `analogDigitalIsolate` 惩罚 |

---

## 七、闭环校验

```
AiPipelineOrchestrator.runFullPipeline()
  → FaultDiagnoser.diagnose()        // 静态 ERC
  → topo.ercErrorList 回写
  → aiDiagnoseAndFix()               // 可选：补电阻 + 重布
  → AppService.runErc()              // UI 层
  → AppService.startSimulation()     // 波形闭环
```

---

## 八、七大模块调用链

### 器件选择

```
AiEngineImpl.aiSelectDevices()
  → AiApiManager.chat(device_select prompt)
  → DeviceSelectEngine.matchFromLlmOutput()
  → IComponentLibrary.semanticSearch / getComponent
```

### 器件摆放

```
AiEngineImpl.aiPlaceDevices()
  → PlacementOptimizer.optimize()
  → schematicEditor.loadTopology()
```

### 自动布线

```
AiEngineImpl.aiAutoRouteGlobal()
  → fetchRoutingConstraints() [LLM]
  → ConstrainedWiringEngine.route()
  → schematicEditor.applyRouteResult()
```

### AppService 入口

```typescript
// 全闭环生成
await appService.aiGenerateCircuit('STM32F103最小系统，LCD1602与按键');

// 仅布线
await appService.aiAutoRoute();

// 局部布局
await appService.aiOptimizePlacement();
```

---

## 九、降级与缓存

| 场景 | 行为 |
|------|------|
| API 429/断网 | `skipLlm` 或自动降级：RAG + 本地 GA/A* |
| 相同 prompt | `AiPipelineOrchestrator.constraintCache` |
| OOD 器件 | 返回空列表 + `oodDetected: true` |
| 离线模式 | 设置 `extra.skipLlm: true`，仅本地算法 |

---

## 十、验收清单

- [ ] 文本生成 STM32 最小系统：器件均来自 `index.lib.json`
- [ ] LLM 返回编造型号：被本地库拦截，使用 fuzzy/RAG 替代
- [ ] 晶振与 MCU 曼哈顿距离 < 120mil（网格 10mil）
- [ ] 电源网络优先于 GPIO 布线
- [ ] `applyRouteResult(keepManual=true)` 不覆盖手工线
- [ ] API 失败时 `degradedMode=true` 仍可生成基础电路
- [ ] ERC 后 `ercErrorList` 非空时 UI 标红

---

*与 [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) §4.4 Prompt 工程、[ARCHITECTURE.md](./ARCHITECTURE.md) 模块7联动。*
