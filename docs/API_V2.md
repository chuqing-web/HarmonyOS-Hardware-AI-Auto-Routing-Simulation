# AI-SCH API v2 接口规范

> 承接超细化设计文档 | 与 `common` 类型一一对应 | 七大模块 v1+v2 双版本兼容

## 全局基础

| 类型 | 文件 | 说明 |
|------|------|------|
| `ErrCode` | `common/types/ErrCode.ets` | 15 项统一错误码 |
| `ApiResult<T>` | `common/utils/ResultHelper.ets` | 含 errCode 的返回结构 |
| `ProgressInfo` | `common/types/ProgressTypes.ets` | 异步任务进度 |
| `SchTopology` | `common/types/TopologyTypes.ets` | 分层原理图拓扑 |
| `SimConfig` | `common/types/SimExtendedTypes.ets` | 完整仿真配置 |
| `AiTaskType` | `common/types/AiExtendedTypes.ets` | 11 类 AI 任务 |
| `LibDevice` | `common/types/AiExtendedTypes.ets` | 器件库完整结构 |
| `TopologyAdapter` | `common/utils/TopologyAdapter.ets` | SchTopology ↔ SchematicDocument |
| `CallbackRegistry` | `common/utils/CallbackRegistry.ets` | UI 回调注册中心 |

## 模块 API 入口

| 模块 | v2 接口文件 | 实现文件 |
|------|------------|---------|
| 1 原理图 | `ISchematicEditor.ets` | `SchematicEditorImpl.ets` |
| 2 器件库 | `IComponentLibrary.ets` | `ComponentLibraryImpl.ets` |
| 3 仿真内核 | `ISimulationKernel.ets` | `SimulationKernelImpl.ets` |
| 4 HEX调试 | `IHexDebugger.ets` | `HexDebuggerImpl.ets` |
| 5 AI引擎 | `IAiEngine.ets` | `AiEngineImpl.ets` |
| 6 API管理 | `IAiApiManager.ets` | `AiApiManagerImpl.ets` |
| 7 文件持久化 | `IFilePersistence.ets` | `FilePersistenceImpl.ets` |

## 五大业务场景调用链

### 场景1：绘制 → HEX → 混合仿真
```
schematicEditor.getFullTopology()
→ componentLibrary.getLibDevice() / validateDeviceParam()
→ hexDebugger.loadHexToMcu()
→ simulationKernel.startSimulation(topo, cfg, onProgress)
→ simulationKernel.globalTimeTick() / getAllWaveData()
→ hexDebugger.stepInto() / get51Sfr()
```

### 场景2：AI 一键布线
```
aiApiManager.getAvailableApiForTask(TASK_AUTO_ROUTE_GLOBAL)
→ aiEngine.runAiTask(TASK_AUTO_ROUTE_GLOBAL, topo, extra, onProgress)
→ schematicEditor.applyRouteResult(routeResult)
→ schematicEditor.runERC()
```

### 场景3：AI API 管理
```
aiApiManager.addApiConfig() / testApiConnect()
→ filePersistence.saveAiApiConfig()
→ aiEngine.bindTaskAiConfig()
```

### 场景4：Proteus 导入
```
filePersistence.importProteusSch(path, onProgress)
→ componentLibrary.mapProteusDevId()
→ schematicEditor.loadTopology()
→ schematicEditor.runERC()
```

### 场景5：AI 故障诊断
```
simulationKernel.getAllWaveData()
→ aiEngine.runAiTask(TASK_CIRCUIT_DIAG_DYNAMIC, topo, {waves})
→ CallbackRegistry.emitErc() / UI 高亮
```

## 边界规则

1. `schematicEditor.setSimBusy(true)` 时批量删除/修改返回 `ERR_SIM_BUSY`
2. ERC 短路错误禁止 `startSimulation()`
3. 未加载 HEX 时调试接口返回 `ERR_MCU_NO_HEX`
4. 撤销栈达上限自动丢弃最早记录（`setUndoCacheCount`）

## AppService 门面

`entry/services/AppService.ets` 封装场景级方法：
- `startSimulation()` / `stopSimulation()`
- `runErc(autoFix)` / `aiAutoRoute()` / `aiGenerateCircuit()`
- 事件总线 + CallbackRegistry 联动 UI

详见 `docs/ARCHITECTURE.md` 与 `docs/DEVELOPMENT_SCHEDULE.md`。
