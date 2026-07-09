# UI 布局与操作逻辑优化设计

**日期**: 2026-07-08
**范围**: entry/src/main/ets/pages/Index.ets、components/proteus/*、theme/ProteusTheme.ets
**方向**: 工业 EDA 重构（方案 A）— 保留 Proteus 工业灰色美学，重建结构

## 1. 背景与问题

当前 UI 存在以下结构性问题，与专业 EDA 工具（KiCad/Altium/Proteus）的预期不符：

1. **假菜单**：`ProteusMenuItem` 点击直接执行单个硬编码动作（File→Save, Edit→Undo），而非展开下拉菜单。
2. **工具栏拥挤**：`MainToolbar` 将 30+ 纯文字按钮塞入关闭滚动条的 `Scroll`，用户无法感知溢出，无分组、无图标、无提示。
3. **右侧面板拥挤**：240px 固定宽 + PropertyPanel 固定 220px 高 + 7 个可折叠段堆叠，展开 3+ 段时底部不可达，且不区分上下文。
4. **浮动工具栏无效**：`FloatingToolBar` 含一个 "ESC" 按钮，仅写入状态消息，无实际功能。
5. **无快捷键**：状态栏、提示、菜单均无快捷键标注，无法键盘操作。
6. **面板不可调宽**：LEFT/RIGHT_PANEL_WIDTH 为静态常量。
7. **UI 状态不持久化**：折叠段、面板宽、工具模式在重启后丢失。

## 2. 目标

- 让菜单栏、工具栏、右侧面板的结构匹配专业 EDA 工具的预期。
- 支持键盘优先操作（快捷键 + 提示）。
- 面板可调宽，UI 状态跨会话持久化。
- 上下文敏感：右侧面板根据所选元件类型自动提示相关 Tab。
- 保留 Proteus 8.16 灰色工业美学（直角、无圆角、无阴影、无渐变）。

## 3. 设计

### 3.1 菜单栏 → 真下拉菜单

新增 `ProteusDropdownMenu` 组件（`components/proteus/ProteusWidgets.ets`）：
- `Button` 触发器 + 绝对定位 `Column` 浮层（`Stack` + `zIndex`）。
- 每项 `ProteusMenuItemEntry`：`label`、`shortcut`（右对齐灰色）、可选分隔符、`onAction`。
- 透明全屏 `Column` 背板捕获外部点击以关闭。
- 键盘：`Alt+letter` 打开对应菜单（v1 框架预留，可选实现）。

菜单结构（EDA 惯例）：

| 菜单 | 项 |
|---|---|
| File | New `Ctrl+N`, Open… `Ctrl+O`, Save `Ctrl+S`, Save As… `Ctrl+Shift+S`, ——, Recent ▸, ——, Export… |
| Edit | Undo `Ctrl+Z`, Redo `Ctrl+Y`, ——, Cut `Ctrl+X`, Copy `Ctrl+C`, Paste `Ctrl+V`, Delete `Del`, ——, Find… `Ctrl+F` |
| View | Zoom In `+`, Zoom Out `-`, Fit `Ctrl+0`, ——, Grid `G`, Ruler `R`, ——, Panels ▸ |
| Place | Component… `P`, Wire `W`, Bus `B`, Label `L`, ——, Power `Shift+P`, Ground `Shift+G` |
| Design | ERC `F7`, AI Route `F8`, AI Layout `F9`, AI Diagnose `F10`, ——, Align ▸, Distribute ▸ |
| Sim | Run `F5`, Pause `F6`, Stop `Shift+F5`, ——, Fault…, Instruments… |
| Library | Browse…, Search… `Ctrl+L`, ——, Refresh |
| Help | About, ——, Shortcuts `F1` |

### 3.2 工具栏 → 分组图标 + 溢出

新增 `components/proteus/ProteusIcons.ets`：
- `ProteusIconName` 枚举 + `ProteusIcon({name, size, color})` 组件。
- 单色 SVG path 数据（从 Tabler/Heroicons MIT 集借鉴），无二进制资源，鸿蒙可缩放。

新增 `ProteusTooltip` 组件：`Stack` 浮层，10pt 字体、有边框、无阴影，显示工具名 + 快捷键。

重组 `MainToolbar` 为带标签分组（每组有小标题 + 分隔线）：

1. File — New, Open, Save
2. History — Undo, Redo, Delete
3. Edit — Cut, Copy, Paste
4. View — Zoom In, Out, Fit, Grid
5. Place — Component, Wire, Bus, Label, VCC, GND（当前模式高亮）
6. Align — Left, Right, Top, Distribute, Rotate, Mirror（选中 ≥2 才启用）
7. Sim — Run/Stop（toggle）, Pause, ERC
8. AI — Route, Layout, Diagnose

右侧锚定 `More` (⋯) 按钮替代横向 Scroll；窄屏时分组从右到左折叠进 More（v1 先做简单版：固定布局 + 溢出按钮列全部项）。

模式反馈：当前工具模式（SELECT/PLACE/WIRE/BUS/LABEL）以 `TREE_SELECTED` 背景高亮 + 加粗。

### 3.3 右侧面板 → Tabbed + 上下文 + 可调宽

- 顶部 `ProteusPanelTitle`（带折叠箭头，与左面板一致）。
- 标题下方一行 `ProteusNavTab`：**Props | Sim | AI | Debug | Instruments | Fault | Teaching**。一次只显示一个 Tab 内容。
- Props Tab：`PropertyPanel` 用 `layoutWeight(1)` 占满剩余高度；未选元件时显示提示文字 "Select a component to edit properties."
- 上下文相关：选中 MCU 类（libraryId 以 `STM32`/`8051` 开头）→ Debug Tab 显示红点徽章 + 自动切换；选中仪器 → Instruments Tab 徽章。用户可手动切走，上下文仅提示不强制。
- 可调宽：右侧 4px `Column` 分隔条，拖动改 `@State rightPanelWidth`，光标 `ew-resize`。左面板同理。Min/Max：左 160–400，右 200–420。

### 3.4 浮动工具栏 → 上下文动作

- 选中元件：Rotate (R), Mirror (M), Delete (Del), Props。删除 ESC。
- 选中 wire：Delete, Properties。
- Place 模式：不显示浮动栏，画布显示放置预览。
- 全局快捷键（`aboutToAppear` 注册 `keyEventListener`，TextInput 聚焦时不触发）：
  - `Esc` 取消当前模式 → SELECT
  - `Del` 删除选中
  - `R` 旋转、`M` 镜像
  - `P/W/B/L` 切换模式
  - `Ctrl+Z/Y` undo/redo
  - `Ctrl+S` save
  - `F5/Shift+F5` sim run/stop
  - `F7` ERC

### 3.5 状态栏 → 3 语义组

- 左组：`[Mode] X:1234 Y:567 Grid:50mil Sel:3`
- 中组：`statusMessage`（layoutWeight=1，居中，溢出省略）+ 运行时 `AI stage NN%`
- 右组：`ERC: 0 ✓` | `Sim: Idle` | `100%`
- 移除重复的 "ERC OK" 文字，0 时仅显示绿色 `ERC: 0` 带勾。
- `Sel: 0` 灰化而非消失，保持栏位稳定。

### 3.6 可调宽 + 状态持久化

新增 `utils/UiStateStore.ets`，包装 `AppStorage`：

- 字段：`leftPanelWidth`、`rightPanelWidth`、`activeRightTab`、`leftLibCollapsed`、`leftNavCollapsed`、`rightCollapsed`、`gridVisible`、`rulerVisible`、`toolMode`、`expandedCategories`（左面板类别展开集）。
- `aboutToAppear` 加载；变更时 300ms 防抖保存。
- 存储在 `AppStorage` → 应用沙箱，按用户持久化，无项目数据。

## 4. 文件改动清单

### 新增
- `entry/src/main/ets/components/proteus/ProteusIcons.ets` — 图标枚举 + 组件
- `entry/src/main/ets/utils/UiStateStore.ets` — UI 状态持久化

### 修改
- `entry/src/main/ets/components/proteus/ProteusWidgets.ets`
  - 新增：`ProteusDropdownMenu`、`ProteusMenuItemEntry`、`ProteusTooltip`、`ProteusIconHost`（或直接用 `ProteusIcon`）
  - 修改：`ProteusClassicBtn` 增加 `tooltip`、`active`、`iconName` 属性（或弃用并由 `ProteusToolBtn` 替代）
- `entry/src/main/ets/pages/Index.ets`
  - 重写 `MenuBar` builder（真下拉菜单）
  - 重写 `MainToolbar` builder（分组图标 + 溢出）
  - 重写 `RightPanel` builder（Tabbed）
  - 重写 `FloatingToolBar` builder（上下文动作）
  - 重写 `StatusBar` builder（3 组）
  - `aboutToAppear` 注册全局快捷键 + 加载 `UiStateStore`
  - 用 `leftPanelWidth`/`rightPanelWidth` `@State` 替代静态常量
  - 增加左/右分隔条 `Builder`

## 5. 非目标（YAGNI）

- 不做 Ribbon 样式工具栏。
- 不做暗色主题切换逻辑（`ProteusDarkColors` 已存在但切换不在本次范围）。
- 不做拖拽 dock/undock 面板。
- 不做多语言新增（仅复用现有 `string.json`，新增菜单项需补 i18n key 但不增加新语种）。
- 不做触屏手势优化（鼠标/2in1 优先，触屏已有 `ProteusToolBtn` 用 `Button` 确保点击可靠）。

## 6. 风险与回退

- **快捷键冲突**：HarmonyOS 全局快捷键可能与系统手势冲突。回退：仅在画布聚焦时监听。
- **下拉菜单浮层定位**：ArkUI `Stack` + `zIndex` 在嵌套 `Row` 内可能被裁剪。回退：使用 `bindMenu` 系统菜单 API（外观略偏离 Proteus 风格但功能可靠）。
- **SVG path 兼容性**：鸿蒙 `Path` 指令支持有限。回退：使用 `Image` + SVG 资源文件。
- **AppStorage 持久化**：若跨设备同步需求未满足，仅本地沙箱即可。

## 7. 测试

- 人工冒烟：每菜单项、每工具按钮、每 Tab 切换、每快捷键。
- 回归：现有功能（placeComponent、handleRotate、handleMirror、ERC、AI route、Sim run/pause/stop）全部保持可用。
- 无自动化 UI 测试框架引入（项目无现成 UI 测试基础设施）。
