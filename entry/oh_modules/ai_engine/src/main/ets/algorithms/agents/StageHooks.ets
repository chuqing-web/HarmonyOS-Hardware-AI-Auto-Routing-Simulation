/**
 * StageHooks — 质量门禁钩子 + 批判上限 + LLM 批判回调
 */
export type AgentStageId =
  'requirements' | 'select' | 'layout' | 'net' | 'route' | 'qa';

export interface StageHookContext {
  stage: AgentStageId;
  runId: string;
  softMiss?: number;
  hardLines?: string[];
  warFailed?: boolean;
  zeroMatch?: boolean;
  attempt?: number;
}

export interface StageHooks {
  beforeStage?: (ctx: StageHookContext) => string | null;
  afterGenerate?: (ctx: StageHookContext) => string | null;
  afterTools?: (ctx: StageHookContext) => string | null;
  afterCritique?: (ctx: StageHookContext, exhausted: boolean) => string | null;
}

export interface CritiqueAttemptResult<T> {
  ok: boolean;
  value: T;
  critiqueCtx?: StageHookContext;
}

/** 批判上限 — 用显式字段，禁止 Record 对象字面量类型 */
export class CritiqueLimits {
  static readonly requirements: number = 2;
  static readonly select: number = 3;
  static readonly layout: number = 3;
  static readonly net: number = 3;
  static readonly route: number = 3;
  static readonly qa: number = 2;

  static of(stage: AgentStageId): number {
    if (stage === 'requirements') {
      return CritiqueLimits.requirements;
    }
    if (stage === 'select') {
      return CritiqueLimits.select;
    }
    if (stage === 'layout') {
      return CritiqueLimits.layout;
    }
    if (stage === 'net') {
      return CritiqueLimits.net;
    }
    if (stage === 'route') {
      return CritiqueLimits.route;
    }
    return CritiqueLimits.qa;
  }
}

/** @deprecated 兼容旧引用 */
export const CRITIQUE_LIMITS = CritiqueLimits;

export const QA_FIX_ROUNDS = 2;

export const STAGE_ORDER: AgentStageId[] = [
  'requirements', 'select', 'layout', 'net', 'route', 'qa'
];

export function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage as AgentStageId);
  return i >= 0 ? i : -1;
}

export function canSkipStage(stageCompleted: string, target: AgentStageId): boolean {
  return stageRank(stageCompleted) >= stageRank(target);
}

export function defaultCritique(ctx: StageHookContext): string | null {
  if (ctx.zeroMatch) {
    return 'zero library matches';
  }
  if (ctx.warFailed) {
    return 'WAR failed';
  }
  if (ctx.hardLines && ctx.hardLines.length > 0) {
    return ctx.hardLines.slice(0, 3).join('; ');
  }
  // softMiss：任意 attempt 均批判（末轮 fail-closed）
  if ((ctx.softMiss ?? 0) > 0) {
    return `softMiss=${ctx.softMiss}`;
  }
  return null;
}

export type LlmCritiqueFn = (ctx: StageHookContext, stageOk: boolean) =>
  Promise<string | null>;

/** 带批判上限的重试；可选 LLM 批判文案 */
export async function withCritiqueLimit<T>(
  stage: AgentStageId,
  runId: string,
  hooks: StageHooks | null,
  attemptFn: (attempt: number) => Promise<CritiqueAttemptResult<T>>,
  onExhausted: (last: T, reason: string) => T,
  llmCritique?: LlmCritiqueFn
): Promise<T> {
  const limit = CritiqueLimits.of(stage);
  let lastValue: T | null = null;
  let lastReason = 'critique exhausted';
  for (let attempt = 0; attempt < limit; attempt++) {
    const beforeCtx: StageHookContext = { stage: stage, runId: runId, attempt: attempt };
    const before = hooks?.beforeStage?.(beforeCtx);
    if (before) {
      lastReason = before;
      break;
    }
    const r = await attemptFn(attempt);
    lastValue = r.value;
    const genCtx: StageHookContext = r.critiqueCtx ?? {
      stage: stage, runId: runId, attempt: attempt
    };
    genCtx.attempt = attempt;
    let afterGen = hooks?.afterGenerate?.(genCtx) ?? defaultCritique(genCtx);
    if (llmCritique && (!r.ok || afterGen)) {
      const llmReason = await llmCritique(genCtx, r.ok);
      if (llmReason !== null && llmReason !== undefined) {
        afterGen = llmReason;
      } else if (llmReason === null && r.ok && !genCtx.zeroMatch &&
        !(genCtx.hardLines && genCtx.hardLines.length > 0)) {
        afterGen = null;
      }
    }
    if (!afterGen && r.ok) {
      hooks?.afterCritique?.(genCtx, false);
      return r.value;
    }
    lastReason = afterGen ?? 'stage not ok';
    const afterTools = hooks?.afterTools?.(genCtx);
    if (afterTools) {
      lastReason = afterTools;
    }
    if (attempt + 1 >= limit) {
      hooks?.afterCritique?.(genCtx, true);
      break;
    }
  }
  return onExhausted(lastValue as T, lastReason);
}
