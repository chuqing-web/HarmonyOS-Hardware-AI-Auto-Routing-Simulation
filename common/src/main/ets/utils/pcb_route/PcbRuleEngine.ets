/**
 * 规则 Scope 引擎：Net > NetClass > Layer > Global，按 priority 取最高。
 * 对齐路线图阶段二「完整规则引擎」轻量版。
 */
import { PcbDocument, PcbLayerId } from '../../types/PcbTypes';
import { findNetClass } from '../PcbNetUtil';
import { tracePcb, tracePcbWarn } from '../PcbTraceLog';

export enum RuleScopeLevel {
  NET = 1,
  NET_CLASS = 2,
  LAYER = 3,
  GLOBAL = 4
}

export type RuleKind = 'width' | 'clearance' | 'via_drill' | 'via_dia';

export interface ScopedRule {
  name: string;
  kind: RuleKind;
  scope: RuleScopeLevel;
  /** 数值越大越优先；同 scope 内比 priority */
  priority: number;
  value: number;
  netId?: string;
  classId?: string;
  layer?: PcbLayerId;
  /** 可选上限（width 冲突检测） */
  maxValue?: number;
}

export interface RuleResolveContext {
  netId: string;
  netName: string;
  classId: string;
  layer: PcbLayerId;
}

export interface RuleEngine {
  rules: ScopedRule[];
}

let cachedEngineKey = '';
let cachedEngine: RuleEngine | null = null;

export function getRuleEngine(doc: PcbDocument): RuleEngine {
  const key = `${doc.id}|${doc.metadata.modifiedAt}|${doc.nets.length}|${doc.netClasses.length}`;
  if (cachedEngine !== null && cachedEngineKey === key) {
    return cachedEngine;
  }
  cachedEngine = buildRuleEngine(doc);
  cachedEngineKey = key;
  return cachedEngine;
}

function classIdOf(doc: PcbDocument, netId: string): string {
  for (let i = 0; i < doc.nets.length; i++) {
    if (doc.nets[i].id === netId) {
      const c = doc.nets[i].classId;
      return c !== undefined && c.length > 0 ? c : '';
    }
  }
  return '';
}

function netNameOf(doc: PcbDocument, netId: string): string {
  for (let i = 0; i < doc.nets.length; i++) {
    if (doc.nets[i].id === netId) {
      return doc.nets[i].name;
    }
  }
  return netId;
}

/** 从文档构造默认规则表（全局 + netClass + 电源/差分启发式） */
export function buildRuleEngine(doc: PcbDocument): RuleEngine {
  const rules: ScopedRule[] = [];
  const dr = doc.metadata.designRules;

  rules.push({
    name: 'global_min_width',
    kind: 'width',
    scope: RuleScopeLevel.GLOBAL,
    priority: 10,
    value: Math.max(dr.minTrackWidth, dr.defaultTrackWidth),
    maxValue: 200
  });
  rules.push({
    name: 'global_clearance',
    kind: 'clearance',
    scope: RuleScopeLevel.GLOBAL,
    priority: 10,
    value: dr.minClearance
  });
  rules.push({
    name: 'global_via_drill',
    kind: 'via_drill',
    scope: RuleScopeLevel.GLOBAL,
    priority: 10,
    value: dr.minViaDrill
  });
  rules.push({
    name: 'global_via_dia',
    kind: 'via_dia',
    scope: RuleScopeLevel.GLOBAL,
    priority: 10,
    value: dr.minViaDrill + 2 * Math.max(dr.minAnnularRing, 4)
  });

  for (let i = 0; i < doc.netClasses.length; i++) {
    const nc = doc.netClasses[i];
    rules.push({
      name: `class_width_${nc.name}`,
      kind: 'width',
      scope: RuleScopeLevel.NET_CLASS,
      priority: 50,
      value: nc.trackWidth,
      classId: nc.id,
      maxValue: 200
    });
    rules.push({
      name: `class_clr_${nc.name}`,
      kind: 'clearance',
      scope: RuleScopeLevel.NET_CLASS,
      priority: 50,
      value: nc.clearance,
      classId: nc.id
    });
    rules.push({
      name: `class_via_drill_${nc.name}`,
      kind: 'via_drill',
      scope: RuleScopeLevel.NET_CLASS,
      priority: 50,
      value: nc.viaDrill,
      classId: nc.id
    });
    rules.push({
      name: `class_via_dia_${nc.name}`,
      kind: 'via_dia',
      scope: RuleScopeLevel.NET_CLASS,
      priority: 50,
      value: nc.viaDiameter,
      classId: nc.id
    });
  }

  // 差分对：更严 clearance（约 2×）
  const dps = doc.diffPairs ?? [];
  for (let i = 0; i < dps.length; i++) {
    const dp = dps[i];
    const gap = dp.gapMil > 0 ? dp.gapMil : 8;
    rules.push({
      name: `diff_clr_${dp.name || i}`,
      kind: 'clearance',
      scope: RuleScopeLevel.NET,
      priority: 80,
      value: Math.max(dr.minClearance, gap),
      netId: dp.netIdP
    });
    rules.push({
      name: `diff_clr_n_${dp.name || i}`,
      kind: 'clearance',
      scope: RuleScopeLevel.NET,
      priority: 80,
      value: Math.max(dr.minClearance, gap),
      netId: dp.netIdN
    });
  }

  // 电源网：加宽
  for (let i = 0; i < doc.nets.length; i++) {
    const n = doc.nets[i];
    const nm = n.name.toUpperCase();
    const isPwr = nm === 'GND' || nm === 'VSS' || nm === 'VCC' || nm === 'VDD' ||
      nm.indexOf('VCC') === 0 || nm.indexOf('VDD') === 0 || nm.indexOf('3V3') >= 0;
    if (!isPwr) {
      continue;
    }
    const nc = findNetClass(doc, n.classId);
    rules.push({
      name: `pwr_width_${n.name}`,
      kind: 'width',
      scope: RuleScopeLevel.NET,
      priority: 70,
      value: Math.max(nc.trackWidth, dr.defaultTrackWidth) * (nm.indexOf('GND') >= 0 || nm === 'VSS' ? 1.5 : 1.25),
      netId: n.id,
      maxValue: 200
    });
  }

  // 内层略窄优选（LAYER scope，priority 低于 net）
  const copper = doc.layerStack?.layers ?? [];
  for (let i = 0; i < copper.length; i++) {
    const ly = copper[i].copperLayerId;
    if (ly === undefined) {
      continue;
    }
    if (ly === PcbLayerId.F_CU || ly === PcbLayerId.B_CU) {
      continue;
    }
    rules.push({
      name: `inner_width_${ly}`,
      kind: 'width',
      scope: RuleScopeLevel.LAYER,
      priority: 30,
      value: Math.max(dr.minTrackWidth, dr.defaultTrackWidth * 0.9),
      layer: ly,
      maxValue: 200
    });
  }

  return { rules };
}

function matches(rule: ScopedRule, ctx: RuleResolveContext): boolean {
  if (rule.scope === RuleScopeLevel.GLOBAL) {
    return true;
  }
  if (rule.scope === RuleScopeLevel.NET) {
    return rule.netId !== undefined && rule.netId === ctx.netId;
  }
  if (rule.scope === RuleScopeLevel.NET_CLASS) {
    return rule.classId !== undefined && rule.classId.length > 0 && rule.classId === ctx.classId;
  }
  if (rule.scope === RuleScopeLevel.LAYER) {
    return rule.layer !== undefined && rule.layer === ctx.layer;
  }
  return false;
}

/** 匹配规则中 priority 最高；同 priority 取 scope 更具体（数值更小） */
export function resolveRule(
  engine: RuleEngine,
  kind: RuleKind,
  ctx: RuleResolveContext
): ScopedRule | null {
  let best: ScopedRule | null = null;
  for (let i = 0; i < engine.rules.length; i++) {
    const r = engine.rules[i];
    if (r.kind !== kind || !matches(r, ctx)) {
      continue;
    }
    if (best === null) {
      best = r;
      continue;
    }
    if (r.priority > best.priority) {
      best = r;
    } else if (r.priority === best.priority && r.scope < best.scope) {
      best = r;
    }
  }
  return best;
}

export function resolveClearanceScoped(
  doc: PcbDocument,
  netId: string,
  layer: PcbLayerId = PcbLayerId.F_CU
): number {
  const engine = getRuleEngine(doc);
  const ctx: RuleResolveContext = {
    netId,
    netName: netNameOf(doc, netId),
    classId: classIdOf(doc, netId),
    layer
  };
  const r = resolveRule(engine, 'clearance', ctx);
  if (r !== null && r.value > 0) {
    return r.value;
  }
  return doc.metadata.designRules.minClearance;
}

export function resolveWidthScoped(
  doc: PcbDocument,
  netId: string,
  layer: PcbLayerId = PcbLayerId.F_CU
): number {
  const engine = getRuleEngine(doc);
  const ctx: RuleResolveContext = {
    netId,
    netName: netNameOf(doc, netId),
    classId: classIdOf(doc, netId),
    layer
  };
  const r = resolveRule(engine, 'width', ctx);
  const minW = doc.metadata.designRules.minTrackWidth;
  if (r !== null && r.value > 0) {
    let w = r.value;
    if (r.maxValue !== undefined && w > r.maxValue) {
      w = r.maxValue;
    }
    return Math.max(minW, w);
  }
  return Math.max(minW, doc.metadata.designRules.defaultTrackWidth);
}

/** 规则一致性：min>max、矛盾值 */
export function validateRuleEngine(engine: RuleEngine): string[] {
  const msgs: string[] = [];
  for (let i = 0; i < engine.rules.length; i++) {
    const r = engine.rules[i];
    if (r.maxValue !== undefined && r.value > r.maxValue) {
      msgs.push(`${r.name}: value ${r.value} > max ${r.maxValue}`);
    }
    if (r.value <= 0) {
      msgs.push(`${r.name}: non-positive value`);
    }
  }
  // 同 net 同 kind 多条且值差过大
  for (let i = 0; i < engine.rules.length; i++) {
    for (let j = i + 1; j < engine.rules.length; j++) {
      const a = engine.rules[i];
      const b = engine.rules[j];
      if (a.kind !== b.kind || a.scope !== RuleScopeLevel.NET || b.scope !== RuleScopeLevel.NET) {
        continue;
      }
      if (a.netId === undefined || a.netId !== b.netId) {
        continue;
      }
      if (Math.abs(a.value - b.value) > Math.max(a.value, b.value) * 0.5) {
        msgs.push(`conflict ${a.name} vs ${b.name} on net ${a.netId}`);
      }
    }
  }
  return msgs;
}

export function logRuleEngineOnce(doc: PcbDocument): void {
  const engine = getRuleEngine(doc);
  const bad = validateRuleEngine(engine);
  tracePcb('RULE_ENGINE', `rules=${engine.rules.length} conflicts=${bad.length}`);
  for (let i = 0; i < Math.min(bad.length, 8); i++) {
    tracePcbWarn('RULE_CONFLICT', bad[i]);
  }
}
