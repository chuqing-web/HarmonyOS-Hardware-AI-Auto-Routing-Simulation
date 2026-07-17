/**
 * AI Prompt 模板加载器 v5.0
 * 权威文案: skill/prompts/*.md → 同步 templates/*.ets
 * 本文件只负责 load / render / 几何注入辅助，不含巨型 system 字符串。
 */
import { IComponentLibrary } from 'component_library';
import { SchTopology, DeviceInst, DeviceHitGeometry,
  SELECTION_HIT_PAD, FOREIGN_PIN_CLEARANCE, MatchedDevice, Point2D } from 'common';
import { PromptVarEntry } from '../internal/AiEngineTypes';
import { applyPromptVars } from '../internal/AiEngineHelpers';
import { TemplateSchematicKit } from '../algorithms/TemplateSchematicKit';
import { PromptTemplate } from './PromptTypes';
import { TOPOLOGY_ANTIPATTERN_GUARD } from './templates/SharedPromptRules';
import { DEVICE_SELECT_PROMPT } from './templates/DeviceSelectPrompt';
import { LAYOUT_PROMPT } from './templates/LayoutPrompt';
import { NET_PLAN_PROMPT } from './templates/NetPlanPrompt';
import { ROUTE_PROMPT } from './templates/RoutePrompt';
import { SELF_REVIEW_PROMPT } from './templates/SelfReviewPrompt';
import { DIAG_PROMPT } from './templates/DiagPrompt';
import { GEN_SCH_PROMPT } from './templates/GenSchPrompt';
import { MODULAR_PLAN_PROMPT } from './templates/ModularPlanPrompt';
import { CircuitIntent } from '../algorithms/CircuitIntent';
import {
  assembleDeviceSelectSystem, assembleNetPlanSystem
} from './templates/IntentPromptFragments';

export { PromptTemplate } from './PromptTypes';

/** renderEnriched 选项 */
export interface RenderEnrichOptions {
  /** 注入全库每个器件的全部引脚（选型必开） */
  includeFullPins?: boolean;
  /** 仅注入 libDevId 逗号清单（modular_plan 用，不必全脚） */
  includeLibIds?: boolean;
  /** 按意图组装 system（device_select / net_plan） */
  intent?: CircuitIntent;
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

// ---- 器件库摘要缓存 ----

let cachedCatalogSummary: string = '';
let cachedCatalogLibIds: string = '';
let cachedFullPinCatalog: string = '';

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

/** 全库器件 + 每个引脚 id/name/局部坐标 — 选型阶段强制注入 */
function buildFullCatalogWithPins(library: IComponentLibrary): string {
  const lines: string[] = [];
  lines.push('【完整器件库 — 只能选用下列 libDevId；引脚必须使用下列 pinId/pinName】');
  const categories = library.getCategories();
  for (const cat of categories) {
    const result = library.listByCategory(cat, 1, 200);
    if (result.items.length === 0) {
      continue;
    }
    lines.push(`\n## ${cat}`);
    for (const d of result.items) {
      const pins = d.pins ?? [];
      lines.push(`${d.id} | ${d.name} | pins=${pins.length}`);
      if (pins.length === 0) {
        const meta = library.getDeviceMeta(d.id);
        const metaPins = meta.success && meta.data ? meta.data.pin_list : [];
        if (metaPins.length > 0) {
          const bits: string[] = [];
          for (let i = 0; i < metaPins.length; i++) {
            const mp = metaPins[i];
            bits.push(`${mp.pin_id}(${mp.pin_label ?? mp.pin_id})`);
          }
          lines.push(`  引脚: ${bits.join(', ')}`);
        } else {
          lines.push('  引脚: (无)');
        }
      } else {
        const bits: string[] = [];
        for (let i = 0; i < pins.length; i++) {
          const p = pins[i];
          const px = Math.round(p.position?.x ?? 0);
          const py = Math.round(p.position?.y ?? 0);
          bits.push(`${p.id}(${p.name})@local(${px},${py})`);
        }
        lines.push(`  引脚: ${bits.join(', ')}`);
      }
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
  /** 从 templates 加载；runtime_key 对应 skill/prompts README 映射表 */
  static load(name: string): PromptTemplate {
    switch (name) {
      case 'device_select':
        return DEVICE_SELECT_PROMPT;
      case 'layout':
        return LAYOUT_PROMPT;
      case 'route':
        return ROUTE_PROMPT;
      case 'diag':
        return DIAG_PROMPT;
      case 'gen_sch':
        return GEN_SCH_PROMPT;
      case 'net_plan':
        return NET_PLAN_PROMPT;
      case 'self_review':
        return SELF_REVIEW_PROMPT;
      case 'modular_plan':
        return MODULAR_PLAN_PROMPT;
      default:
        return DEVICE_SELECT_PROMPT;
    }
  }

  /** 按 CircuitIntent 替换 device_select / net_plan 的 system */
  static loadForIntent(name: string, intent: CircuitIntent): PromptTemplate {
    const base = PromptLoader.load(name);
    if (name === 'device_select') {
      const t: PromptTemplate = {
        id: base.id,
        version: base.version,
        system: assembleDeviceSelectSystem(intent),
        userTemplate: base.userTemplate
      };
      return t;
    }
    if (name === 'net_plan') {
      const t: PromptTemplate = {
        id: base.id,
        version: base.version,
        system: assembleNetPlanSystem(intent),
        userTemplate: base.userTemplate
      };
      return t;
    }
    return base;
  }

  static render(template: PromptTemplate, vars: PromptVarEntry[]): string {
    const user = applyPromptVars(template.userTemplate, vars);
    return `${template.system}\n\n${user}`;
  }

  /**
   * 增强版 prompt：注入器件库目录 + 拓扑反模式（SharedPromptRules）。
   * @param options.includeFullPins 选型阶段 true：注入每个器件全部引脚
   * @param options.intent 若提供且模板为 device_select/net_plan，用意图组装 system
   */
  static renderEnriched(template: PromptTemplate, vars: PromptVarEntry[],
    library: IComponentLibrary, options?: RenderEnrichOptions): string {
    let effective = template;
    if (options?.intent) {
      if (template.id.indexOf('device_select') >= 0) {
        effective = PromptLoader.loadForIntent('device_select', options.intent);
      } else if (template.id.indexOf('net_plan') >= 0) {
        effective = PromptLoader.loadForIntent('net_plan', options.intent);
      }
    }
    if (cachedCatalogSummary.length === 0) {
      cachedCatalogSummary = buildCompactCatalog(library);
      cachedCatalogLibIds = buildLibIdList(library);
    }
    if (options?.includeFullPins && cachedFullPinCatalog.length === 0) {
      cachedFullPinCatalog = buildFullCatalogWithPins(library);
    }
    const catalogForUser = options?.includeFullPins ? cachedFullPinCatalog : cachedCatalogSummary;
    let enrichedUser = effective.userTemplate;
    if (enrichedUser.includes('{{library_catalog}}')) {
      enrichedUser = enrichedUser.replace('{{library_catalog}}', catalogForUser);
    }
    if (enrichedUser.includes('{{library_summary}}')) {
      enrichedUser = enrichedUser.replace('{{library_summary}}',
        `可用 libDevId: ${cachedCatalogLibIds}\n${catalogForUser}`);
    }
    const user = applyPromptVars(enrichedUser, vars);

    // 反模式警示始终注入 — 所有阶段都需要电路安全规则
    // 库 ID：选型开 includeFullPins；modular_plan 开 includeLibIds（只要清单）
    const pinRule = options?.includeFullPins
      ? '\n【选型铁律】explicitModel 必须是上方清单中的精确 libDevId；引脚连接只能使用该器件列出的 pinId/pinName；禁止编造库外型号。'
      : (options?.includeLibIds
        ? '\n【库约束 — 硬性】modules[].prompt 中的器件必须是上方清单中的精确 libDevId；禁止 2N3906/BC547 等库外型号；555 定时器用 LM555。'
        : '');
    const wantLibIds = !!(options?.includeFullPins || options?.includeLibIds);
    const idHint = wantLibIds
      ? `\n\n【可用器件 libDevId 清单 — 只能使用下列 ID】:\n${cachedCatalogLibIds}${pinRule}`
      : pinRule;

    return `${effective.system}${TOPOLOGY_ANTIPATTERN_GUARD}${idHint}\n\n${user}`;
  }

  static clearCatalogCache(): void {
    cachedCatalogSummary = '';
    cachedCatalogLibIds = '';
    cachedFullPinCatalog = '';
  }

  static extractJson<T>(content: string): T | null {
    if (!content) {
      return null;
    }
    const trimmed = content.trim();

    try {
      return JSON.parse(trimmed) as T;
    } catch (_e) {
      // continue
    }

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
            } catch (_e2) {
              // continue
            }
          }
        }
      }
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.substring(start, end + 1)) as T;
      } catch (_e3) {
        // continue
      }
    }

    return null;
  }

  static getCachedLibIds(): string {
    return cachedCatalogLibIds;
  }

  /**
   * 布局阶段：每个待摆放器件的选中区尺寸（HIT_PAD），供 AI 避免重合与留走线通道。
   * 给出 rotate=0 / 90 两种下的选中区宽高；摆放后世界 AABB = 中心±半宽高。
   */
  static buildLayoutDeviceHitSummary(devices: MatchedDevice[], library: IComponentLibrary): string {
    if (devices.length === 0) {
      return '(无器件)';
    }
    const lines: string[] = [];
    lines.push(`共 ${devices.length} 个待摆放器件。选中命中区 pad=${SELECTION_HIT_PAD}（与编辑器一致）。`);
    lines.push('规则: 任意两器件摆放后选中区AABB不得相交；区间通道 ≥80mil；中心坐标为 (x,y)。');
    lines.push('');
    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      const comp = library.getComponent(d.libDevId);
      let w0 = 110 + SELECTION_HIT_PAD * 2;
      let h0 = 60 + SELECTION_HIT_PAD * 2;
      let w90 = h0;
      let h90 = w0;
      let pinN = 0;
      if (comp.success && comp.data && comp.data.pins.length > 0) {
        pinN = comp.data.pins.length;
        const r0 = DeviceHitGeometry.hitRectFromPins(
          comp.data.pins, 0, 0, 0, false, SELECTION_HIT_PAD);
        const r90 = DeviceHitGeometry.hitRectFromPins(
          comp.data.pins, 0, 0, 90, false, SELECTION_HIT_PAD);
        w0 = Math.max(20, Math.round(r0.w));
        h0 = Math.max(20, Math.round(r0.h));
        w90 = Math.max(20, Math.round(r90.w));
        h90 = Math.max(20, Math.round(r90.h));
      }
      lines.push(
        `[${i + 1}] libDevId=${d.libDevId} name=${d.name} zone=${d.moduleZone} pins=${pinN}`);
      lines.push(
        `  选中区尺寸 rot0=${w0}×${h0}  rot90=${w90}×${h90}  ` +
        `(中心间距至少 ≈ 半宽之和+80 / 半高之和+80)`);
      lines.push(
        `  例: 若 rot=0，中心至少相距 dx≥${Math.round(w0 / 2 + 40)} 或 dy≥${Math.round(h0 / 2 + 40)} 才够通道`);
    }
    return lines.join('\n');
  }

  static buildDeviceDetailForNetPlan(topo: SchTopology, library: IComponentLibrary): string {
    if (topo.deviceList.length === 0) {
      return '(无器件)';
    }
    const lines: string[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      lines.push(`[${i + 1}] refDes="${d.refName}" libDevId="${d.libDevId}" 位置=(${Math.round(d.x)},${Math.round(d.y)}) rot=${d.rotate}`);

      const comp = library.getComponent(d.libDevId);
      if (comp.success && comp.data && comp.data.pins.length > 0) {
        const hit = DeviceHitGeometry.hitRectFromDeviceInst(d, comp.data.pins, SELECTION_HIT_PAD);
        lines.push(`  选中区AABB: (${Math.round(hit.x)},${Math.round(hit.y)},${Math.round(hit.w)}×${Math.round(hit.h)}) pad=${SELECTION_HIT_PAD}`);
        const pinLines: string[] = [];
        for (let pi = 0; pi < comp.data.pins.length; pi++) {
          const p = comp.data.pins[pi];
          // 精确世界坐标：库脚局部坐标 × 旋转镜像 + 器件原点
          const t = DeviceHitGeometry.transformLocal(p.position, d.rotate, d.mirrorH);
          const wx = Math.round(d.x + t.x);
          const wy = Math.round(d.y + t.y);
          pinLines.push(`${p.id}(${p.name})@世界(${wx},${wy})`);
        }
        lines.push(`  引脚精确世界坐标: ${pinLines.join('  ')}`);
      } else {
        const meta = library.getDeviceMeta(d.libDevId);
        const metaPins = meta.success && meta.data ? meta.data.pin_list : [];
        if (metaPins.length > 0) {
          const locals: Point2D[] = [];
          const pinLines: string[] = [];
          for (let pi = 0; pi < metaPins.length; pi++) {
            const mp = metaPins[pi];
            const localOff = TemplateSchematicKit.pinOffset(d.libDevId, mp.pin_id, mp.pin_label ?? mp.pin_id);
            locals.push(localOff);
            const t = DeviceHitGeometry.transformLocal(localOff, d.rotate, d.mirrorH);
            const wx = Math.round(d.x + t.x);
            const wy = Math.round(d.y + t.y);
            pinLines.push(`${mp.pin_id}(${mp.pin_label ?? mp.pin_id})@世界(${wx},${wy})`);
          }
          const hit = DeviceHitGeometry.hitRectFromLocalPoints(
            locals, d.x, d.y, d.rotate, d.mirrorH, SELECTION_HIT_PAD,
            d.refName, d.instUuid, d.libDevId);
          lines.push(`  选中区AABB: (${Math.round(hit.x)},${Math.round(hit.y)},${Math.round(hit.w)}×${Math.round(hit.h)})`);
          lines.push(`  引脚精确世界坐标: ${pinLines.join('  ')}`);
        } else {
          lines.push('  引脚: (无引脚信息)');
        }
      }
    }
    lines.push('');
    lines.push(`【导线禁区】选中区AABB + 无关引脚${FOREIGN_PIN_CLEARANCE}mil 安全圈 — routeWaypoints 不得落入`);
    return lines.join('\n');
  }

  static buildWirePathReport(topo: SchTopology): string {
    const lines: string[] = [];
    lines.push('=== 导线完整路径覆盖 ===');
    if (topo.wireList.length === 0) {
      lines.push('  (尚无导线)');
      return lines.join('\n');
    }
    for (let i = 0; i < topo.wireList.length; i++) {
      const cov = DeviceHitGeometry.wireCoverage(topo.wireList[i]);
      lines.push('  ' + DeviceHitGeometry.formatWireCoverage(cov, 16));
    }
    lines.push(`规则: 路径不得进入器件选中区(pad=${SELECTION_HIT_PAD}); 距无关脚≥${FOREIGN_PIN_CLEARANCE}mil`);
    return lines.join('\n');
  }

  static buildPositionSummary(topo: SchTopology, library?: IComponentLibrary): string {
    if (topo.deviceList.length === 0) {
      return '(无器件)';
    }
    const lines: string[] = [];
    lines.push(`共 ${topo.deviceList.length} 个器件:\n`);

    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const id = (d.libDevId ?? '').toUpperCase();
      let tag = '';
      if (id.includes('MCU') || id.includes('STM32') || id.includes('AT89') || id.includes('STC')) {
        tag = ' [MCU]';
      } else if (id === 'VCC' || id === 'GND') {
        tag = ' [电源]';
      } else if (id.includes('AMMETER') || id.includes('VOLTMETER') || id.includes('MULTIMETER')) {
        tag = ' [仪器]';
      } else if (id.includes('LED')) {
        tag = ' [LED]';
      } else if (id.startsWith('R_')) {
        tag = ' [电阻]';
      } else if (id.startsWith('C_')) {
        tag = ' [电容]';
      } else if (id.includes('555')) {
        tag = ' [定时器]';
      } else if (id.includes('OSC') || id.includes('XTAL') || id.includes('CRYSTAL')) {
        tag = ' [晶振]';
      }
      let hitStr = '';
      if (library) {
        const comp = library.getComponent(d.libDevId);
        if (comp.success && comp.data && comp.data.pins.length > 0) {
          const hit = DeviceHitGeometry.hitRectFromDeviceInst(d, comp.data.pins, SELECTION_HIT_PAD);
          hitStr = ` 选中区=(${Math.round(hit.x)},${Math.round(hit.y)},${Math.round(hit.w)}×${Math.round(hit.h)})`;
        }
      }
      lines.push(`  ${d.refName}${tag} @ (${Math.round(d.x)}, ${Math.round(d.y)})${hitStr}`);
    }

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
        let wireTip = '';
        if (dist <= 200) {
          wireTip = ' [近距-导线直连]';
        } else if (dist <= 500) {
          wireTip = ' [中距-可用导线]';
        } else {
          wireTip = ' [远距-考虑标号]';
        }
        pairs.push(`  ${a.refName}↔${b.refName}: dx=${dx} dy=${dy} dist=${dist}${dirStr}${wireTip}`);
      }
    }
    pairs.sort();
    for (let k = 0; k < pairs.length; k++) {
      lines.push(pairs[k]);
    }

    lines.push('');
    lines.push('布线区域建议:');
    lines.push('  器件上方(y小)区域 → 适合走电源线 VCC');
    lines.push('  器件下方(y大)区域 → 适合走地线 GND');
    lines.push('  器件左右两侧 → 适合走信号线');
    lines.push('  导线不应穿过任何器件的选中命中区(HIT_PAD=14，与编辑器选中范围一致)');
    lines.push(`  导线距无关引脚安全距离 ≥${FOREIGN_PIN_CLEARANCE}mil`);

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
        } else if (c.devices.length >= 3) {
          lines.push(`    💡 此区域器件较密集 → 考虑对穿越此区域的跨区域信号使用标号`);
        }
      }
    } else {
      lines.push('  器件分布均匀，无可识别的密集区');
    }
    const totalWireEstimate = topo.deviceList.length * 2;
    if (totalWireEstimate > 10) {
      lines.push(`  预估导线数>${totalWireEstimate} → 建议对跨区域信号优先使用 joinByLabel 标号管理`);
    }
    lines.push('  标号决策原则: 你(LLM)决定每个连接的 mode。密集区优先标号，稀疏区优先导线。');

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
        } else if (hs.pinCount >= 8) {
          lines.push(`    💡 此区域引脚较密 → 强烈建议穿越此区域的信号使用标号`);
        }
      }
    } else {
      lines.push('  引脚分布均匀，无高密度引脚集中区');
    }

    return lines.join('\n');
  }

  private static detectClusters(topo: SchTopology): ClusterInfo[] {
    const visited = new Set<string>();
    const clusters: ClusterInfo[] = [];
    const THRESHOLD = 150;

    for (const d of topo.deviceList) {
      if (visited.has(d.instUuid)) continue;
      const group: DeviceInst[] = [d];
      visited.add(d.instUuid);
      let head = 0;
      while (head < group.length) {
        const cur = group[head];
        for (const other of topo.deviceList) {
          if (visited.has(other.instUuid)) continue;
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
        for (const dev of group) { sumX += dev.x; sumY += dev.y; }
        const cx = sumX / group.length;
        const cy = sumY / group.length;
        let maxR = 0;
        for (const dev of group) {
          const r = Math.hypot(dev.x - cx, dev.y - cy);
          if (r > maxR) maxR = r;
        }
        clusters.push({ devices: group, cx, cy, radius: maxR + 30 });
      }
    }
    return clusters;
  }

  private static analyzePinDensity(topo: SchTopology): PinHotspot[] {
    const CELL = 100;
    const cellMap = new Map<string, number>();

    for (const dev of topo.deviceList) {
      const pinCount = PromptLoader.estimatePinCount(dev.libDevId);
      const cx = Math.floor(dev.x / CELL);
      const cy = Math.floor(dev.y / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const key = `${cx + dx},${cy + dy}`;
          cellMap.set(key, (cellMap.get(key) ?? 0) + pinCount);
        }
      }
    }

    const hotspots: PinHotspot[] = [];
    cellMap.forEach((pinCount, key) => {
      if (pinCount >= 5) {
        const parts = key.split(',');
        const cellX = Number(parts[0]) * CELL;
        const cellY = Number(parts[1]) * CELL;
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

    hotspots.sort((a, b) => b.pinCount - a.pinCount);
    return hotspots.slice(0, 5);
  }

  private static estimatePinCount(libDevId: string): number {
    const id = (libDevId ?? '').toUpperCase();
    if (id.length === 0) return 4;
    if (id.includes('STM32') || id.includes('AT89') || id.includes('STC')) return 40;
    if (id.includes('MCU') || id.includes('ESP32')) return 30;
    if (id.includes('LCD') || id.includes('DISPLAY')) return 16;
    if (id.includes('OP') || id.includes('LM358') || id.includes('LM324') || id.includes('LM555')) return 8;
    if (id.includes('LOGIC') || id.includes('GATE') || id.includes('74')) return 14;
    if (id.includes('I2C') || id.includes('SPI') || id.includes('UART')) return 8;
    if (id.includes('AMMETER') || id.includes('VOLTMETER') || id.includes('METER')) return 3;
    if (id.includes('OSCILLOSCOPE')) return 4;
    if (id.startsWith('R_') || id.startsWith('C_') || id.startsWith('LED_') ||
      id.startsWith('L_') || id.startsWith('D_')) return 2;
    if (id.includes('XTAL') || id.includes('CRYSTAL') || id.includes('OSC')) return 2;
    if (id === 'VCC' || id === 'GND') return 1;
    return 4;
  }
}
