# 各阶段共享规则（注入 / 复用）

> 对应运行时：`SharedPromptRules.ets`  
> 来源：`skill/SKILL.md` §4–§7 + DeviceHitGeometry

## 仪器拓扑铁律

```
1. 电流表(AMMETER_DC)必须串联: VCC→I+→I-→负载。I+/I-绝不同网（同网=短路）
2. 电压表(VOLTMETER_DC)分布在不同节点对；禁止多表测同一对
3. 仪器统一 joinByLabel，禁止仪器引脚长导线
4. 每个电路必须有 VCC 与 GND；电源名不得用于信号网
```

## 导线几何硬门禁

```
1. 导线不得进入器件「选中命中区」(HIT_PAD=14，与编辑器选中范围一致)
2. 导线距无关引脚 ≥20mil；仅允许连接本网引脚
3. 仅正交走线；不同 net 禁止共线重叠
4. 端点须落在目标引脚附近；弯折点不得落入选中区 AABB
5. 无法绕开选中区时改用 joinByLabel
```

## 连接方式摘要

```
强制 joinWired: 晶振/去耦、LED+限流、同区短距非仪器
强制 joinByLabel: 仪器、跨区远距、多脚(>4)、局部拥塞
【硬】同一引脚物理导线端点 ≤2；第3根起必须用网络标号(joinByLabel)
电源轨: 标号优先，就近可短导线
```

## 拓扑反模式（renderEnriched 注入）

```
1. 电流表 I+/I- 同网 → 短路
2. 所有电压表测同一节点对
3. VCC 直连 GND（无负载）
4. 器件完全浮空
5. 信号网命名为 VCC/GND
6. GPIO 直连 VCC/GND
7. 导线侵入选中区或碰无关脚
```

## 完整生图门禁

```
阻断: ERC error/critical + 功能影响 warning + 几何 error(wire_body/pin_proximity/wire_cross=正交交叉或共线重叠)
软性可保留: 去耦余量、入口电解、耐压余量、连线拥挤 warning
```

## 互斥双色开关

```
必须 RELAY_SPDT + SW_PUSH(线圈) + LED_GREEN + LED_RED + 两颗 R_330 + VCC + GND
COM→GND；断开绿灯经 NC；闭合红灯经 NO
禁止仅用 SW_PUSH 假装 SPDT
```
