# Ngspice NAPI 原生模块（HarmonyOS）

## 目标

将 Ngspice 41+ 编译为 HarmonyOS NAPI `.so`，供 `SpiceRunner.tryLoadNative()` 加载。

## 构建步骤（概要）

1. 交叉编译 Ngspice for OHOS (`aarch64-linux-ohos`)
2. 编译本目录 `ngspice_napi.cpp` 为 NAPI 模块
3. 输出 `libngspice_napi.so` 至 `entry/libs/arm64-v8a/`

## 暴露 API

| NAPI 方法 | 对应 C API |
|-----------|------------|
| `init()` | `ngSpice_Init` |
| `command(cmd)` | `ngSpice_Command` |
| `circ(netlist)` | `ngSpice_Circ` |
| `getVec(name)` | `ngGet_Vec_Info` |
| `destroy()` | 清理回调与电路 |

## 当前状态

`ngspice_napi.cpp` 为桩实现，返回 `native=false`，仿真降级至 `AnalogEngine`。
