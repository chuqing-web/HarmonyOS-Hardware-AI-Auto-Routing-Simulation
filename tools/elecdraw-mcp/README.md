# ElecDraw MCP（Cursor / OpenClaw）

本机 MCP 适配器：把工具调用转发到 **正在运行的 ElecDraw App** 的 Agent Bridge（`127.0.0.1` HTTP JSON-RPC）。

## 前置条件

1. 启动 ElecDraw（Harmony 应用需能在本机监听 `127.0.0.1`；模拟器需做端口转发）。
2. 打开 **AI 设置 → Agent Bridge**，确认「运行中」，复制 MCP 配置（含 token）。

## Cursor 配置

把应用里「复制 MCP 配置」的内容合并进 Cursor 的 `mcp.json`，并把 `args` 改成你仓库的绝对路径，例如：

```json
{
  "mcpServers": {
    "elecdraw": {
      "command": "node",
      "args": ["C:/Projects/ElecDraw_Harmony/tools/elecdraw-mcp/index.mjs"],
      "env": {
        "ELECDRAW_AGENT_URL": "http://127.0.0.1:39281/rpc",
        "ELECDRAW_AGENT_TOKEN": "<从应用复制>"
      }
    }
  }
}
```

Node ≥ 18（使用全局 `fetch`）。

## 能力边界

- **有**：器件库搜索、原理图放置/连线/标号、PCB 层数/活动层/封装移动/清铜/走线/via/换层等原子操作  
- **有**：绘制会话 `sch_drawing_session_*` / `pcb_drawing_session_*`（复用 AI「生成中」遮罩 + AI 面板日志，前缀 `[Agent]`）  
- **有**：`pcb_get_summary.pads[]`（焊盘世界坐标 + net）、`pcb_add_track_segment`、`pcb_clear_copper`、`pcb_move_footprint`  
- **无**：应用内 AI 流水线、WAR/自动布线工具（策略由外部 Agent 决定）

## 推荐绘制流程

### 原理图

```
sch_drawing_session_begin({ reason: "分压电路" })
  → lib_search / sch_place_device / sch_add_wire_segment …
  →（放置后会自动 fit；也可 sch_fit_all_in_view）
sch_drawing_session_end({ fit: true })
```

### PCB（4 层手工连线示例）

```
pcb_drawing_session_begin({ reason: "RC 板布线" })
  → pcb_forward_annotate
  → pcb_set_copper_layer_count({ count: 4 })
  → pcb_clear_copper
  → pcb_move_footprint({ ref, x, y, rotation? }) …
  → pcb_get_summary   # 用 pads[] 取焊盘坐标与 netId
  → pcb_set_active_layer / pcb_add_track_segment 或 start→commit / pcb_switch_route_layer / pcb_add_via
pcb_drawing_session_end({ fit: true })
```

- 会话期间：原理图与 PCB 画布均锁定；PCB 页遮罩显示「Agent 绘制中」并预览最近 `[Agent]` 日志。  
- Agent 会话内**强制**焊盘/走线 clearance（异网与空网焊盘均挡线；安装孔始终挡线）  
- 同层铜拓扑自愈：同网交叉/T 接拆段成结点；走线压过同网焊盘则拆段并吸附（交叉即连通、压盘即连通）  
- `commit_route` / `add_track_segment` 失败返回可读原因；`add_track_segment` 为精确直线（不拐弯误吸）  
- `pcb_clear_mount_nets`：清除 H 安装孔网络，避免误连 GND  
- 若忘记 `begin`：首次 PCB 突变操作会**自动 begin**；画完后仍须 `end` 解锁（或在 App AI 面板点「结束绘制」/「取消」）。

## 手动测 RPC

```bash
curl -s -X POST http://127.0.0.1:39281/rpc ^
  -H "Authorization: Bearer <token>" ^
  -H "Content-Type: application/json" ^
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"sys.ping\",\"params\":{}}"
```

## 模拟器端口转发（若 App 跑在设备/模拟器）

在 Windows 宿主机上把设备端口转到本机，例如（以 hdc 为例）：

```bash
hdc fport tcp:39281 tcp:39281
```

具体命令以你的 DevEco / hdc 版本为准。
