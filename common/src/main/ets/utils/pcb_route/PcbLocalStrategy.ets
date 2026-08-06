/**
 * PCB 本地确定性策略：net_plan / route_policy
 * 供 AI 管线本地优先加速；几何路由器接受 fromLocal。
 */
import { PcbDocument, PcbLayerId, PcbViaKind, copperLayersFromStack } from '../../types/PcbTypes';
import {
  PcbLayerRole, PcbNetKind, PcbNetPlanEntry, PcbNetPlanResult, PcbRoutePolicy,
  policyCoversCopperLayers, validateLayerRoleSemantics
} from '../../types/PcbAiRouteTypes';

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
 * 本地网络计划：按网名分类，pads≥2 一律 forceTrack（Cu=2 不用 forcePour）。
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
  // Cu≥4：F=stub, B=signal_h, In1=gnd_bus, In2=vcc_bus，其余 signal_v/power_h/power_v
  const defaults: PcbLayerRole[] = [
    'stub', 'signal_h', 'gnd_bus', 'vcc_bus', 'signal_v', 'power_h', 'power_v', 'stub'
  ];
  for (let i = 0; i < copper.length; i++) {
    const lid = copper[i] as string;
    if (lid === 'F.Cu') {
      roles[lid] = 'stub';
    } else if (lid === 'B.Cu') {
      roles[lid] = 'signal_h';
    } else if (lid.indexOf('In1') >= 0) {
      roles[lid] = 'gnd_bus';
    } else if (lid.indexOf('In2') >= 0) {
      roles[lid] = 'vcc_bus';
    } else {
      roles[lid] = defaults[Math.min(i, defaults.length - 1)];
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
  const layerRoles = assignRolesForCopper(copper, hasSignal, hasPowerOrGnd);
  const policy: PcbRoutePolicy = {
    fromLlm: false,
    fromLocal: true,
    layerRoles,
    netPriority,
    viaPreference: { kind: PcbViaKind.THROUGH, preferThrough: true },
    globalConstraint: 'local: Cu stub+signal_h; power on bus or shared signal_h',
    reason: 'local deterministic route_policy'
  };
  const missing = policyCoversCopperLayers(policy, copper);
  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i++) {
      policy.layerRoles[missing[i]] = i === 0 ? 'stub' : 'signal_h';
    }
  }
  const sem = validateLayerRoleSemantics(policy, netPlan);
  if (sem.length > 0) {
    // 语义缺口时兜底：确保 B.Cu 或末层为 signal_h，F 为 stub
    if (copper.length >= 1) {
      policy.layerRoles[copper[0] as string] = 'stub';
    }
    if (copper.length >= 2) {
      policy.layerRoles[copper[copper.length - 1] as string] = 'signal_h';
    }
    policy.reason = `local route_policy (sem-fix: ${sem.join('; ')})`;
  }
  return policy;
}
