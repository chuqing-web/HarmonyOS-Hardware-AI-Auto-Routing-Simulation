# PCB 自动布线基准探针

## 用法（应用内）

```ts
import { runAutorouteBenchmark, runAutorouteE2EBenchmark } from 'common';

const probe = runAutorouteBenchmark();
const e2e = await runAutorouteE2EBenchmark();
```

## 用例

| 名称 | 内容 | 目的 |
|------|------|------|
| simple3 | 3 条平行两焊盘网 | 基础可达 |
| cross2 | 对角交叉 + 中央障碍 | 绕障 |
| grid8 | 8 网 + EdgeGCell/TA 烟测 | 中等密度 |
| e2e_* | 同上板跑完整 `autoRoutePcb` | 端到端布通/DRC/耗时 |

## 指标含义

- `mazeOk` / `gridlessOk` / `roomOk` / `polyOk`：该引擎命中数
- `completion`（探针）：任一引擎成功即计通
- E2E：`completionRate` / `drcErrorCount` / `elapsedMs` 来自真实流水线

## 注意

探针偏乐观；E2E 更接近产品 F8。**F8 主路径现为确定性通道引擎**（`channelAutoRoutePcb`），不再依赖 LLM/迷宫墙钟。真实工程板仍需人工板金样。
