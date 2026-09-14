/**
 * PCB 本地确定性策略：net_plan / route_policy
 * 供 AI 管线本地优先加速；几何路由器接受 fromLocal。
 */
import { PcbDocument, PcbLayerId, PcbViaKind, copperLayersFromStack } from '../../types/PcbTypes';
import {
  PcbLayerRole, PcbNetKind, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy,
  policyCoversCopperLayers, validateLayerRoleSemantics
} from '../../types/PcbAiRouteTypes';
import { detectMcuColumnClusters } from './PcbMcuColumnPlacer';
import { buildMcuHandLayerRoles } from './PcbMcuHandCopper';

function classifyNetKind(name: string): PcbNetKind {
  const u = (name ?? '').toUpperCase();
  if (u === 'GND' || u === 'VSS' || u === 'AGND' || u === 'DGND' ||
    u.indexOf('GND') >= 0 || u.endsWith('_GND')) {
    return 'gnd';
  }
  if (u === 'VCC' || u === 'VDD' || u === 'VEE' || u === 'VOUT' || u === 'VIN' ||
    u === '+5V' || u === '+3V3' || u === '3V3' || u === '5V' ||
    u.indexOf('VCC') >= 0 || u.indexOf('VDD') >= 0 ||
    (u.startsWith('V') && u.length <= 6 && u.indexOf('SIG') < 0)) {
    return 'power';
  }
  return 'signal';
}

function padCountForNet(doc: PcbDocument, netId: string): number {
  let n = 0;
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if ((pad.netId ?? '') === netId) {
        n++;
      }
    }
  }
  return n;
}

/**
 * 本地网络计划：按网名分类，pads≥2 一律 forceTrack（永不 forcePour；最多 8 层均走线）。
 */
export function buildLocalNetPlan(doc: PcbDocument): PcbNetPlanResult {
  const nets: PcbNetPlanEntry[] = [];
  let powerSlot = 0;
  for (let i = 0; i < doc.nets.length; i++) {
    const n = doc.nets[i];
    const pads = padCountForNet(doc, n.id);
    const kind = classifyNetKind(n.name);
    let priority = 5;
    let layerHint = 'signal_h';
    let busYOffset: number | undefined = undefined;
    if (kind === 'gnd') {
      priority = 10;
      layerHint = 'gnd_bus';
      busYOffset = -80;
    } else if (kind === 'power') {
      priority = 9 - Math.min(powerSlot, 3);
      layerHint = powerSlot === 0 ? 'vcc_bus' : 'power_h';
      busYOffset = 80 + powerSlot * 40;
      powerSlot++;
    } else {
      priority = 7;
      layerHint = 'signal_h';
      busYOffset = 0;
    }
    // 单脚网 defer；可布网 forceTrack（对齐 Cu=2 不用 pour）
    const routeMode = pads >= 2 ? 'forceTrack' : 'defer';
    nets.push({
      netId: n.id,
      netName: n.name,
      kind,
      routeMode,
      layerHint,
      busYOffset,
      priority
    });
  }
  nets.sort((a, b) => b.priority - a.priority);
  const priorityOrder: string[] = [];
  for (let i = 0; i < nets.length; i++) {
    priorityOrder.push(nets[i].netId);
  }
  return {
    fromLlm: false,
    fromLocal: true,
    nets,
    priorityOrder,
    reason: 'local deterministic net_plan'
  };
}

function assignRolesForCopper(
  copper: PcbLayerId[],
  hasSignal: boolean,
  hasPowerOrGnd: boolean
): Record<string, PcbLayerRole> {
  const roles: Record<string, PcbLayerRole> = {};
  const n = copper.length;
  if (n === 0) {
    return roles;
  }
  if (n === 2) {
    let f = '';
    let b = '';
    for (let i = 0; i < copper.length; i++) {
      const lid = copper[i] as string;
      if (lid === 'F.Cu' || lid.indexOf('F.') === 0) {
        f = lid;
      } else if (lid === 'B.Cu' || lid.indexOf('B.') === 0) {
        b = lid;
      }
    }
    if (f.length === 0) {
      f = copper[0] as string;
    }
    if (b.length === 0) {
      b = copper[copper.length - 1] as string;
    }
    roles[f] = 'stub';
    if (hasSignal || !hasPowerOrGnd) {
      roles[b] = 'signal_h';
    } else {
      roles[b] = 'power_h';
    }
    return roles;
  }
  // Cu≥3（含 4/6/8）：每层真实走线角色，禁止内电层当整面参考平面
  // 首层 stub，中间交替 H/V，末层 power_h（Cu=3 中间用 signal_v）
  for (let i = 0; i < copper.length; i++) {
    const lid = copper[i] as string;
    if (i === 0) {
      roles[lid] = 'stub';
    } else if (i === copper.length - 1) {
      roles[lid] = 'power_h';
    } else if (copper.length === 3) {
      roles[lid] = 'signal_v';
    } else if ((i % 2) === 1) {
      roles[lid] = 'signal_h';
    } else {
      roles[lid] = 'signal_v';
    }
  }
  // 保证至少一层 stub
  let hasStub = false;
  const keys = Object.keys(roles);
  for (let i = 0; i < keys.length; i++) {
    if (roles[keys[i]] === 'stub') {
      hasStub = true;
      break;
    }
  }
  if (!hasStub && copper.length > 0) {
    roles[copper[0] as string] = 'stub';
  }
  return roles;
}

/**
 * 本地层角色策略：按 Cu 数与是否有电源/信号填满每一铜层。
 */
export function buildLocalRoutePolicy(
  doc: PcbDocument,
  netPlan: PcbNetPlanResult
): PcbRoutePolicy {
  const copper = copperLayersFromStack(doc.layerStack);
  let hasSignal = false;
  let hasPowerOrGnd = false;
  const netPriority: Record<string, number> = {};
  for (let i = 0; i < netPlan.nets.length; i++) {
    const ne = netPlan.nets[i];
    netPriority[ne.netId] = ne.priority;
    if (ne.routeMode === 'defer') {
      continue;
    }
    if (ne.kind === 'signal') {
      hasSignal = true;
    } else {
      hasPowerOrGnd = true;
    }
  }
  const mcuHand = detectMcuColumnClusters(doc) > 0;
  const layerRoles = mcuHand
    ? buildMcuHandLayerRoles(copper)
    : assignRolesForCopper(copper, hasSignal, hasPowerOrGnd);
  const policy: PcbRoutePolicy = {
    fromLlm: false,
    fromLocal: true,
    layerRoles,
    netPriority,
    viaPreference: { kind: PcbViaKind.THROUGH, preferThrough: true },
    globalConstraint: mcuHand
      ? 'mcu_hand: In1/In2 power H trunks; In3/In4 column feeds; F stub; B hops'
      : 'local: Cu stub+signal_h; power on bus or shared signal_h',
    reason: mcuHand
      ? 'local mcu hand layer roles'
      : 'local deterministic route_policy'
  };
  const missing = policyCoversCopperLayers(policy, copper);
  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i++) {
      policy.layerRoles[missing[i]] = i === 0 ? 'stub' : 'signal_h';
    }
  }
  const sem = validateLayerRoleSemantics(policy, netPlan);
  if (sem.length > 0 && !mcuHand) {
    // 语义缺口时兜底：确保 B.Cu 或末层为 signal_h，F 为 stub
    if (copper.length >= 1) {
      policy.layerRoles[copper[0] as string] = 'stub';
    }
    if (copper.length >= 2) {
      policy.layerRoles[copper[copper.length - 1] as string] = 'signal_h';
    }
    policy.reason = `local route_policy (sem-fix: ${sem.join('; ')})`;
  } else if (sem.length > 0 && mcuHand) {
    policy.reason = `local mcu hand layer roles (sem-note: ${sem.join('; ')})`;
  }
  return policy;
}
