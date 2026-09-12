/**
 * PCB 五 Agent 适配：Placement / Strategy / Routing / Critic（LLM）+ Knowledge（本地）。
 * 由 Orchestrator 调度；几何仍走本地 RoutingCore。硬性 JSON 契约 + Schema + nudge。
 */
import {
  PcbRouteAgentBundle, PcbAutoRouteAgentContext,
  PcbAutoGlobalAdvice, PcbAutoRipupAdvice, PcbAutoGeometryAdvice,
  PcbPlacementAgentAdvice, PcbCriticReport, PcbKnowledgeSnapshot, PcbPlacementPlan,
  PcbPlacementItem, PcbLayerRole, PcbCorridorBias, PcbPreferEdge, PcbAutoAgentOp,
  isValidPcbLayerRole, Logger, INSTR_TRACE_TAG, MCU_COLUMN_PLACE_RECIPE
} from 'common';
import { IAiApiManager, ChatOptions } from 'ai_api_manager';

const TAG = '[PCB_ROUTE_AGENTS]';

/** Knowledge：会话级经验缓存（不落盘） */
const SESSION_EXPERIENCE: string[] = [];

/** 与 ai_api_manager 默认读超时同量级：等 LLM 回包；API 失败只等待重试，禁止 LOCAL */
const TIMEOUT_GLOBAL_MS = 600000;
const TIMEOUT_RIPUP_MS = 600000;
const TIMEOUT_QA_MS = 600000;
const TIMEOUT_SALVAGE_MS = 600000;

/** 退避等待上限（传输/超时/无 API 时硬等待，不退回本地） */
const API_WAIT_BACKOFF_MAX_MS = 30000;

/** LLM 阶段硬性契约：违反则整轮作废并 nudge 重发。 */
const HARD_REPLY_CONTRACT =
  '【硬性契约 HARD CONTRACT — 违反即作废，系统会要求重发】\n' +
  'A) 答案必须写在 content 正文；禁止只写 reasoning/thinking；禁止空 content。\n' +
  'B) content 整段只能是一个 JSON 对象：第一个非空白字符必须是 {，最后一个非空白字符必须是 }。\n' +
  'C) 禁止 markdown（含 ```）、禁止中文/英文解释散文、禁止 <think>/<thinking>、禁止只输出半截表。\n' +
  'D) 本阶段必填键缺失、类型错误、铜层角色非法 = 无效回复。\n' +
  'E) 不要把额度花在推理上；直接输出合法 JSON。\n';

const NUDGE_EMPTY =
  '\n\n【系统硬性重试】上一轮 content 为空或失败。必须在 content 输出完整 JSON（首{末}）；' +
  '禁止 reasoning 占满额度；禁止散文。立即重发。';

const NUDGE_BAD_JSON =
  '\n\n【系统硬性重试】上一轮不是可解析 JSON（或缺外层 {}）。' +
  'content 必须整段仅为一个 JSON 对象。立即重发。';

function nudgeSchema(reason: string): string {
  return `\n\n【系统硬性重试】上一轮 Schema 不合格：${reason}。按正确示例重发完整 JSON。`;
}

function extractJsonObject(raw: string): Record<string, Object> | null {
  let text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  text = text.substring(start, end + 1);
  try {
    return JSON.parse(text) as Record<string, Object>;
  } catch (_e) {
    return null;
  }
}

function parseLayerRoles(obj: Object | undefined, copper: string[]): Record<string, PcbLayerRole> | null {
  if (obj === undefined || obj === null || typeof obj !== 'object') {
    return null;
  }
  const src = obj as Record<string, Object>;
  const out: Record<string, PcbLayerRole> = {};
  for (let i = 0; i < copper.length; i++) {
    const lid = copper[i];
    const v = src[lid];
    if (v === undefined || v === null) {
      return null;
    }
    const role = String(v);
    if (!isValidPcbLayerRole(role)) {
      return null;
    }
    out[lid] = role as PcbLayerRole;
  }
  return out;
}

/** 兼容：{layerRoles:{...}} 或直接 {"F.Cu":"stub",...} */
function coerceLayerRoles(obj: Record<string, Object>, copper: string[]): Record<string, PcbLayerRole> | null {
  const nested = parseLayerRoles(obj['layerRoles'], copper);
  if (nested !== null) {
    return nested;
  }
  return parseLayerRoles(obj, copper);
}

function parseStringArray(obj: Object | undefined): string[] {
  const out: string[] = [];
  if (!(obj instanceof Array)) {
    return out;
  }
  for (let i = 0; i < obj.length; i++) {
    const s = String(obj[i] ?? '').trim();
    if (s.length > 0) {
      out.push(s);
    }
  }
  return out;
}

function parseCorridorBias(obj: Object | undefined): Record<string, PcbCorridorBias> {
  const out: Record<string, PcbCorridorBias> = {};
  if (obj === undefined || obj === null || typeof obj !== 'object' || obj instanceof Array) {
    return out;
  }
  const src = obj as Record<string, Object>;
  const keys = Object.keys(src);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const raw = src[k];
    if (raw === undefined || raw === null || typeof raw !== 'object') {
      continue;
    }
    const row = raw as Record<string, Object>;
    const bias: PcbCorridorBias = {};
    if (row['preferLayer'] !== undefined) {
      bias.preferLayer = String(row['preferLayer']);
    }
    if (row['preferEdge'] !== undefined) {
      const e = String(row['preferEdge']);
      if (e === 'N' || e === 'S' || e === 'E' || e === 'W') {
        bias.preferEdge = e as PcbPreferEdge;
      }
    }
    out[k] = bias;
  }
  return out;
}

function failNetKeysFromCtx(ctx: PcbAutoRouteAgentContext): string[] {
  const keys: string[] = [];
  const seen: Record<string, boolean> = {};
  const lines = ctx.failSummaries !== undefined ? ctx.failSummaries : [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const bar = line.indexOf('|');
    const id = bar > 0 ? line.substring(0, bar) : line;
    const name = bar > 0 ? line.substring(bar + 1) : '';
    if (id.length > 0 && !seen[id]) {
      seen[id] = true;
      keys.push(id);
    }
    if (name.length > 0 && !seen[name]) {
      seen[name] = true;
      keys.push(name);
    }
  }
  return keys;
}

/** 兼容扁平 {preferLayer,preferEdge} → 对所有失败网填 corridorBias */
function coerceCorridorBias(obj: Record<string, Object>,
  failKeys: string[]): Record<string, PcbCorridorBias> {
  let bias = parseCorridorBias(obj['corridorBias']);
  if (Object.keys(bias).length > 0) {
    return bias;
  }
  const hasFlat = obj['preferLayer'] !== undefined || obj['preferEdge'] !== undefined;
  if (!hasFlat) {
    return bias;
  }
  const one: PcbCorridorBias = {};
  if (obj['preferLayer'] !== undefined) {
    one.preferLayer = String(obj['preferLayer']);
  }
  if (obj['preferEdge'] !== undefined) {
    const e = String(obj['preferEdge']);
    if (e === 'N' || e === 'S' || e === 'E' || e === 'W') {
      one.preferEdge = e as PcbPreferEdge;
    }
  }
  for (let i = 0; i < failKeys.length; i++) {
    bias[failKeys[i]] = one;
  }
  return bias;
}

function chatOpts(readTimeoutMs: number): ChatOptions {
  // 勿压低 maxTokens：agnes 等忽略 disableThinking 时 reasoning 与 content 共享额度，
  // 2048 会被 finish_reason=length 吃光 → 空正文。交给 api 默认 64K。
  const o: ChatOptions = {
    temperature: 0,
    disableThinking: true,
    connectTimeoutMs: Math.min(30000, readTimeoutMs),
    readTimeoutMs: readTimeoutMs
  };
  return o;
}

/** 抽出顶层 JSON 数组（裸 placements / ops 列表） */
function extractJsonArray(raw: string): Object | null {
  let text = raw.trim();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return null;
  }
  text = text.substring(start, end + 1);
  try {
    const v = JSON.parse(text) as Object;
    return v instanceof Array ? v : null;
  } catch (_e) {
    return null;
  }
}

/**
 * 硬性 JSON：优先完整对象；兼容 flash 常给的顶层数组（再由 coerce 包外壳）。
 */
function parseHardJsonContent(raw: string): Object | null {
  const text = raw.trim();
  if (text.length < 2) {
    return null;
  }
  const c0 = text.charAt(0);
  const cN = text.charAt(text.length - 1);
  if (c0 === '[' && cN === ']') {
    try {
      const v = JSON.parse(text) as Object;
      return v instanceof Array ? v : null;
    } catch (_e) {
      return extractJsonArray(text);
    }
  }
  if (c0 === '{' && cN === '}') {
    try {
      return JSON.parse(text) as Object;
    } catch (_e) {
      return extractJsonObject(text);
    }
  }
  // 极短前言：先对象后数组
  const asObj = extractJsonObject(text);
  if (asObj !== null) {
    return asObj;
  }
  return extractJsonArray(text);
}

/** chat() 已内部重试仍 thinking 吃光 → 继续硬等待，禁止 LOCAL */
function looksLikeThinkingAte(err: string): boolean {
  const m = err.toLowerCase();
  if (m.indexOf('正文为空') >= 0 || m.indexOf('推理可能占满') >= 0) {
    return true;
  }
  if (m.indexOf('empty content') < 0) {
    return false;
  }
  return m.indexOf('finish_reason=length') >= 0
    || m.indexOf('reasoninglen=') >= 0
    || m.indexOf('reasoning ate') >= 0
    || m.indexOf('stop_reason=max_tokens') >= 0;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void) => {
    setTimeout((): void => {
      resolve();
    }, ms);
  });
}

function apiWaitBackoffMs(attempt: number): number {
  return Math.min(API_WAIT_BACKOFF_MAX_MS, 2000 * Math.pow(2, Math.min(attempt - 1, 4)));
}

/** 传输/超时/无 API/thinking 占额 → 继续硬等待，禁止退回 LOCAL */
function looksLikeApiNeedWait(err: string, elapsed: number, readTimeoutMs: number): boolean {
  const low = err.toLowerCase();
  if (elapsed >= readTimeoutMs - 500 || low.indexOf('timeout') >= 0) {
    return true;
  }
  if (err.indexOf('No enabled AI API') >= 0) {
    return true;
  }
  if (looksLikeThinkingAte(err)) {
    return true;
  }
  if (low.indexOf('network') >= 0 || low.indexOf('transport') >= 0 ||
    low.indexOf('econn') >= 0 || low.indexOf('socket') >= 0 ||
    low.indexOf('proxy') >= 0 || low.indexOf('dns') >= 0 ||
    low.indexOf('unreachable') >= 0 || low.indexOf('offline') >= 0) {
    return true;
  }
  return false;
}

/**
 * 硬性要求 LLM 回复：空/坏 JSON/Schema/传输失败均 nudge 或退避后重试。
 * API 失败只等待，不退回 LOCAL；仅用户取消才返回 null。
 */
async function chatJsonHard(
  api: IAiApiManager,
  basePrompt: string,
  readTimeoutMs: number,
  stage: string,
  check: (obj: Record<string, Object>) => string | null
): Promise<Record<string, Object> | null> {
  let prompt = basePrompt;
  let attempt = 0;
  while (true) {
    attempt++;
    if (api.isChatCancelled()) {
      Logger.warn(INSTR_TRACE_TAG,
        `${TAG} AUTO_AGENT_HARD_CANCEL ${stage} attempt=${attempt}`);
      return null;
    }
    const t0 = Date.now();
    try {
      Logger.info(INSTR_TRACE_TAG,
        `${TAG} AUTO_AGENT_HARD_WAIT ${stage} attempt=${attempt}`);
      const res = await api.chat(prompt, chatOpts(readTimeoutMs));
      const elapsed = Date.now() - t0;
      if (!res.success || res.data === undefined || res.data.length === 0) {
        const err = res.error ?? 'empty';
        if (looksLikeApiNeedWait(err, elapsed, readTimeoutMs)) {
          const waitMs = apiWaitBackoffMs(attempt);
          Logger.warn(INSTR_TRACE_TAG,
            `${TAG} AUTO_AGENT_API_WAIT ${stage} attempt=${attempt} after=${elapsed}ms` +
            ` sleep=${waitMs}ms err=${err.substring(0, 120)}`);
          await sleepMs(waitMs);
          if (api.isChatCancelled()) {
            return null;
          }
          prompt = basePrompt + NUDGE_EMPTY;
          continue;
        }
        Logger.warn(INSTR_TRACE_TAG,
          `${TAG} AUTO_AGENT_HARD_REJECT ${stage} attempt=${attempt} empty: ${err}`);
        prompt = basePrompt + NUDGE_EMPTY;
        continue;
      }
      const trimmed = res.data.trim();
      if (trimmed.charAt(0) !== '{' && trimmed.charAt(0) !== '[') {
        Logger.warn(INSTR_TRACE_TAG,
          `${TAG} AUTO_AGENT_HARD_REJECT ${stage} attempt=${attempt} not_start_brace`);
      }
      const parsed = parseHardJsonContent(res.data);
      if (parsed === null) {
        Logger.warn(INSTR_TRACE_TAG,
          `${TAG} AUTO_AGENT_HARD_REJECT ${stage} attempt=${attempt} bad_json`);
        prompt = basePrompt + NUDGE_BAD_JSON;
        continue;
      }
      // Flash 模型常输出「半截契约」：先 coerce 再 schema-check；半截不合格继续等 LLM。
      const coercedRaw = coerceLooseAgentJson(stage, parsed);
      if (coercedRaw === null || typeof coercedRaw !== 'object' || coercedRaw instanceof Array) {
        Logger.warn(INSTR_TRACE_TAG,
          `${TAG} AUTO_AGENT_HARD_REJECT ${stage} attempt=${attempt} coerce_not_object`);
        prompt = basePrompt + NUDGE_BAD_JSON;
        continue;
      }
      const coerced = coercedRaw as Record<string, Object>;
      const schemaErr = check(coerced);
      if (schemaErr !== null) {
        Logger.warn(INSTR_TRACE_TAG,
          `${TAG} AUTO_AGENT_HARD_REJECT ${stage} attempt=${attempt} schema=${schemaErr}`);
        prompt = basePrompt + nudgeSchema(schemaErr);
        continue;
      }
      if (attempt > 1) {
        Logger.info(INSTR_TRACE_TAG,
          `${TAG} AUTO_AGENT_HARD_OK ${stage} attempt=${attempt}`);
      }
      return coerced;
    } catch (e) {
      const msg = e instanceof Error ? e.message : `${e}`;
      const elapsed = Date.now() - t0;
      const waitMs = apiWaitBackoffMs(attempt);
      Logger.warn(INSTR_TRACE_TAG,
        `${TAG} AUTO_AGENT_API_WAIT ${stage} attempt=${attempt} after=${elapsed}ms` +
        ` sleep=${waitMs}ms err=${msg.substring(0, 120)}`);
      await sleepMs(waitMs);
      if (api.isChatCancelled()) {
        return null;
      }
      prompt = basePrompt + NUDGE_EMPTY;
    }
  }
}

function checkGlobalSchema(obj: Record<string, Object>, copper: string[]): string | null {
  // 必须外层键 layerRoles。netOrder 可空（调用方用网络列表合成）
  if (obj['layerRoles'] === undefined || obj['layerRoles'] === null) {
    return '禁止裸层表；必须含外层键 layerRoles';
  }
  const roles = parseLayerRoles(obj['layerRoles'], copper);
  if (roles === null) {
    return 'layerRoles 须覆盖全部 copperLayers 且角色枚举合法';
  }
  return null;
}

/** 本地默认层角色：每层都参与走线（对齐模板库，禁止纯平面闲置） */
function defaultLayerRoles(copper: string[]): Record<string, PcbLayerRole> {
  const roles: Record<string, PcbLayerRole> = {};
  const n = copper.length;
  if (n === 0) {
    return roles;
  }
  if (n === 1) {
    roles[copper[0]] = 'stub';
    return roles;
  }
  if (n === 2) {
    roles[copper[0]] = 'stub';
    roles[copper[1]] = 'signal_h';
    return roles;
  }
  // ≥3：首层 stub；末层 power_h；中间 H/V 交替（Cu=3 仅一层中间 → signal_v，与末层 power_h 成对）
  for (let i = 0; i < n; i++) {
    const id = copper[i];
    if (i === 0) {
      roles[id] = 'stub';
    } else if (i === n - 1) {
      roles[id] = 'power_h';
    } else if (n === 3) {
      roles[id] = 'signal_v';
    } else if ((i % 2) === 1) {
      roles[id] = 'signal_h';
    } else {
      roles[id] = 'signal_v';
    }
  }
  return roles;
}

/** 从 netSummaries「id|name|pads」合成布线优先序：信号在前，GND/VCC 靠后 */
function synthesizeNetOrder(netSummaries: string[]): string[] {
  const signal: string[] = [];
  const power: string[] = [];
  for (let i = 0; i < netSummaries.length; i++) {
    const line = netSummaries[i];
    const bar = line.indexOf('|');
    if (bar <= 0) {
      continue;
    }
    const id = line.substring(0, bar).trim();
    if (id.length === 0) {
      continue;
    }
    let name = '';
    const bar2 = line.indexOf('|', bar + 1);
    if (bar2 > bar) {
      name = line.substring(bar + 1, bar2).trim();
    } else {
      name = line.substring(bar + 1).trim();
    }
    const u = name.toUpperCase();
    if (u === 'GND' || u === 'VCC' || u === 'VDD' || u === 'VSS' ||
      u.indexOf('GND') === 0 || u.indexOf('VCC') === 0 || u.indexOf('VDD') === 0) {
      power.push(id);
    } else {
      signal.push(id);
    }
  }
  return signal.concat(power);
}

function knowledgeHintsBlock(ctx: PcbAutoRouteAgentContext): string {
  if (ctx.knowledgeHints === undefined || ctx.knowledgeHints.length === 0) {
    return '';
  }
  return '知识提示：\n' + ctx.knowledgeHints.join('\n') + '\n\n';
}

/** Strategy.plan 精简态势：不要塞满 rats，否则模型只回层表 */
function situationBlockGlobal(ctx: PcbAutoRouteAgentContext): string {
  if (ctx.situationLines !== undefined && ctx.situationLines.length > 0) {
    // 只取 board / copper 行，跳过 rats
    const keep: string[] = [];
    for (let i = 0; i < ctx.situationLines.length && keep.length < 4; i++) {
      const ln = ctx.situationLines[i];
      if (ln.indexOf('board=') >= 0 || ln.indexOf('copper') >= 0 || ln.indexOf('layerRoles') >= 0) {
        keep.push(ln);
      }
    }
    if (keep.length > 0) {
      return '态势：\n' + keep.join('\n') + '\n\n';
    }
  }
  return '';
}

function globalExampleJson(ctx: PcbAutoRouteAgentContext): string {
  const roles = defaultLayerRoles(ctx.copperLayers);
  // 示例给完整网序，避免模型只抄短列表/裸层表
  const order = synthesizeNetOrder(ctx.netSummaries);
  const layerRolesObj: Record<string, Object> = {};
  const rk = Object.keys(roles);
  for (let i = 0; i < rk.length; i++) {
    layerRolesObj[rk[i]] = roles[rk[i]];
  }
  const netOrderArr: string[] = order.length > 0 ? order : ['net_id_signal'];
  const payload: Record<string, Object> = {};
  payload['layerRoles'] = layerRolesObj;
  payload['netOrder'] = netOrderArr;
  payload['reason'] = '每层可布_F扇出_内层正交_B电源';
  return JSON.stringify(payload);
}

function checkRipupSchema(obj: Record<string, Object>): string | null {
  const hasOps = obj['ops'] instanceof Array;
  const hasRipup = obj['ripupTargets'] instanceof Array;
  const hasRetry = obj['retryNetOrder'] instanceof Array;
  if (!hasOps && !hasRipup && !hasRetry) {
    return '须含 ops 或 ripupTargets 或 retryNetOrder（至少一个为数组）';
  }
  if (hasOps) {
    const ops = parseAgentOps(obj['ops']);
    if (ops.length === 0 && !hasRipup && !hasRetry) {
      return 'ops 为空且无 ripupTargets/retryNetOrder';
    }
  }
  return null;
}

function checkGeometrySchema(obj: Record<string, Object>): string | null {
  if (!(obj['ops'] instanceof Array)) {
    return '缺少 ops 数组';
  }
  const ops = parseAgentOps(obj['ops']);
  if (ops.length === 0) {
    return 'ops 不能为空（须含 via_at/via_near/seg/guide_maze 等）';
  }
  return null;
}

/** Strategy.plan：层角色 + 网序 */
function buildGlobalPrompt(ctx: PcbAutoRouteAgentContext): string {
  const example = globalExampleJson(ctx);
  const system =
    HARD_REPLY_CONTRACT +
    '你是 PCB Strategy Agent（战略决策：层分配与布线顺序，不画线）。\n' +
    '【本阶段价值】主要决策是 netOrder（布线优先级）；layerRoles 用标准叠层即可。\n' +
    '【输出模板 — 必须同时含这两个外层键】\n' +
    '{"layerRoles":{...},"netOrder":["net_...","net_...",...],"reason":"..."}\n' +
    'layerRoles 覆盖全部 copperLayers（当前栈每一层都必须有键）；角色仅：gnd_bus|vcc_bus|signal_h|signal_v|stub|power_h|power_v\n' +
    '【硬性·任意层数】每一铜层都必须参与真实走线，禁止闲置层、禁止“只平面不布线”。\n' +
    '模板（按 copperLayers 顺序套用，Cu=N 同样适用）：\n' +
    '  · 第 1 层（通常 F.Cu）= stub（扇出短线）\n' +
    '  · 中间层交替 signal_h / signal_v；若只有 1 个中间层则用 signal_v\n' +
    '  · 最后一层（通常 B.Cu）= power_h（电源走线）\n' +
    '  · Cu=2：F=stub，B=signal_h；Cu=3：F=stub，中=signal_v，B=power_h；Cu≥4：F=stub，内层 H/V 交替，B=power_h\n' +
    '【多MCU最小系统 — 对齐 lab_mcu_stm32 手布】若板含 U+Y 簇：优先用\n' +
    '  · Cu≥6：F=stub，In1=vcc_bus，In2=gnd_bus，In3=power_v，In4=power_v，B=power_h\n' +
    '  · Cu=4：F=stub，In1=power_h，In2=power_v，B=signal_h\n' +
    '  （系统会先手铺电源干线+XTAL/NRST/LED；netOrder 仍把 XTAL/NRST/LED 放前，GND/VCC 最后）\n' +
    '禁止把任一层标成仅 gnd_bus/vcc_bus 却不安排该层走线。\n' +
    'netOrder：用下面网络列表的全部 id；信号/晶振/LED 在前，GND/VCC 最后。\n' +
    '禁止省略外层键 layerRoles 或 netOrder（裸铜层映射无效）。';
  const user =
    knowledgeHintsBlock(ctx) +
    situationBlockGlobal(ctx) +
    `铜层 copperLayers: ${JSON.stringify(ctx.copperLayers)}\n\n` +
    '网络（id|name|pads）— netOrder 必须使用这些 id（尽量全覆盖）：\n' +
    `${ctx.netSummaries.join('\n')}\n\n` +
    '按下面模板改网序后原样输出（勿删键；此为唯一合法形状）：\n' +
    example + '\n\n' +
    '现在立即只输出上述形状的 JSON：';
  return `${system}\n\n${user}`;
}

function failSummaryLines(ctx: PcbAutoRouteAgentContext): string {
  if (ctx.failSummaries === undefined || ctx.failSummaries.length === 0) {
    return '（无）';
  }
  return ctx.failSummaries.join('\n');
}

function errorDigestLines(ctx: PcbAutoRouteAgentContext): string {
  if (ctx.errorDigests === undefined || ctx.errorDigests.length === 0) {
    return '（无诊断）';
  }
  return ctx.errorDigests.join('\n');
}

/** 从诊断里抽阻挡网名，作 ripup 兜底（跳过电源） */
function ripupFromErrorDigests(ctx: PcbAutoRouteAgentContext, cap: number): string[] {
  const digests = ctx.errorDigests !== undefined ? ctx.errorDigests : [];
  const out: string[] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < digests.length && out.length < cap; i++) {
    const line = digests[i];
    const key = 'blocker=';
    const bi = line.indexOf(key);
    if (bi < 0) {
      continue;
    }
    let end = bi + key.length;
    while (end < line.length && line.charAt(end) !== '|') {
      end++;
    }
    const blocker = line.substring(bi + key.length, end).trim();
    if (blocker.length === 0 || blocker === '-') {
      continue;
    }
    const u = blocker.toUpperCase();
    if (u === 'GND' || u === 'VCC' || u === 'VDD' || u === 'VSS' ||
      u.indexOf('GND') === 0 || u.indexOf('VCC') === 0) {
      continue;
    }
    if (seen[blocker]) {
      continue;
    }
    seen[blocker] = true;
    out.push(blocker);
  }
  return out;
}

function preferLayerFromDigests(ctx: PcbAutoRouteAgentContext): string | undefined {
  const digests = ctx.errorDigests !== undefined ? ctx.errorDigests : [];
  const counts: Record<string, number> = {};
  for (let i = 0; i < digests.length; i++) {
    const line = digests[i];
    const key = 'layer=';
    const li = line.indexOf(key);
    if (li < 0) {
      continue;
    }
    let end = li + key.length;
    while (end < line.length && line.charAt(end) !== '|') {
      end++;
    }
    const ly = line.substring(li + key.length, end).trim();
    if (ly.length === 0 || ly === '-') {
      continue;
    }
    counts[ly] = (counts[ly] !== undefined ? counts[ly] : 0) + 1;
  }
  let blocked: string | undefined = undefined;
  let bestN = 0;
  const keys = Object.keys(counts);
  for (let i = 0; i < keys.length; i++) {
    if (counts[keys[i]] > bestN) {
      bestN = counts[keys[i]];
      blocked = keys[i];
    }
  }
  if (blocked === undefined) {
    return undefined;
  }
  // 选与阻挡层不同的铜层（优先内层）
  const copper = ctx.copperLayers;
  for (let i = 0; i < copper.length; i++) {
    if (copper[i] !== blocked && copper[i].indexOf('In') === 0) {
      return copper[i];
    }
  }
  for (let i = 0; i < copper.length; i++) {
    if (copper[i] !== blocked) {
      return copper[i];
    }
  }
  return blocked;
}

function isValidOpKind(k: string): boolean {
  return k === 'ripup' || k === 'clear_reroute' || k === 'force_hv' || k === 'swap_hv' ||
    k === 'via_at' || k === 'via_near' || k === 'seg' || k === 'guide_maze';
}

/** flash 模型常漏包一层：裸 placement / 裸 op → 合法外壳，避免 HARD_REJECT 空跑 3 次 */
function looksLikePlacementRow(row: Record<string, Object>): boolean {
  const fid = String(row['footprintId'] ?? '').trim();
  if (fid.length === 0) {
    return false;
  }
  return numField(row, 'x') !== undefined && numField(row, 'y') !== undefined;
}

function coerceLooseAgentJson(stage: string, parsed: Object): Object {
  if (parsed === null || typeof parsed !== 'object') {
    return parsed;
  }
  // 顶层数组：placements 列表 或 ops 列表
  if (parsed instanceof Array) {
    const arr = parsed as Object[];
    if (arr.length === 0) {
      return parsed;
    }
    const first = arr[0];
    if (first !== undefined && first !== null && typeof first === 'object') {
      const row0 = first as Record<string, Object>;
      if (looksLikePlacementRow(row0) && (stage === 'placement' || stage.indexOf('place') >= 0)) {
        const asRelayout = arr.length >= 6;
        Logger.info(INSTR_TRACE_TAG, `${TAG} AUTO_AGENT_COERCE ${stage} array→` +
          `${asRelayout ? 'relayout' : 'revise'}.placements n=${arr.length}`);
        const wrap: Record<string, Object> = {};
        wrap['decision'] = asRelayout ? 'relayout' : 'revise';
        wrap['placements'] = arr;
        wrap['reason'] = asRelayout ? 'coerced_bare_relayout_array' : 'coerced_bare_placement_array';
        return wrap;
      }
      if (isValidOpKind(String(row0['op'] ?? '').trim())) {
        Logger.info(INSTR_TRACE_TAG, `${TAG} AUTO_AGENT_COERCE ${stage} array→ops n=${arr.length}`);
        const wrap: Record<string, Object> = {};
        wrap['ops'] = arr;
        wrap['reason'] = 'coerced_bare_ops_array';
        return wrap;
      }
    }
    return parsed;
  }
  const o = parsed as Record<string, Object>;
  // placement：裸 {footprintId,x,y,...} 或有 placements 缺 decision
  if (stage === 'placement' || stage.indexOf('place') >= 0) {
    const dec = String(o['decision'] ?? '').trim().toLowerCase();
    if (dec !== 'keep' && dec !== 'revise' && dec !== 'relayout') {
      if (looksLikePlacementRow(o)) {
        Logger.info(INSTR_TRACE_TAG, `${TAG} AUTO_AGENT_COERCE ${stage} bare-row→revise.placements`);
        const wrap: Record<string, Object> = {};
        wrap['decision'] = 'revise';
        wrap['placements'] = [o];
        wrap['reason'] = 'coerced_bare_placement';
        return wrap;
      }
      if (o['placements'] instanceof Array) {
        const arr = o['placements'] as Object[];
        const asRelayout = arr.length >= 6;
        Logger.info(INSTR_TRACE_TAG, `${TAG} AUTO_AGENT_COERCE ${stage} placements+decision` +
          (asRelayout ? '→relayout' : ''));
        o['decision'] = asRelayout ? 'relayout' : 'revise';
        if (o['reason'] === undefined) {
          o['reason'] = asRelayout ? 'coerced_relayout' : 'coerced_decision';
        }
        return o;
      }
    }
  }
  // strategyOnFail / routingSalvage / geometry：裸 {op,net,...}
  if (stage === 'strategyOnFail' || stage === 'routingSalvage' || stage === 'geometry' ||
    stage === 'geometryDrive') {
    const hasOps = o['ops'] instanceof Array;
    const hasRip = o['ripupTargets'] instanceof Array;
    const hasRetry = o['retryNetOrder'] instanceof Array;
    if (!hasOps && !hasRip && !hasRetry) {
      const kind = String(o['op'] ?? '').trim();
      const net = String(o['net'] ?? '').trim();
      if (isValidOpKind(kind) && net.length > 0) {
        Logger.info(INSTR_TRACE_TAG, `${TAG} AUTO_AGENT_COERCE ${stage} bare-op→ops op=${kind} net=${net}`);
        const wrap: Record<string, Object> = {};
        wrap['ops'] = [o];
        wrap['reason'] = 'coerced_bare_op';
        return wrap;
      }
    }
  }
  // strategyPlan：裸层角色表 { "F.Cu":"stub", ... } → 包一层 layerRoles + 空 netOrder 由 schema 再拒/补
  if (stage === 'strategyPlan') {
    const hasRoles = o['layerRoles'] !== undefined && o['layerRoles'] !== null;
    const hasOrder = o['netOrder'] instanceof Array;
    if (!hasRoles) {
      const keys = Object.keys(o);
      let lookLikeRoles = keys.length > 0;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k === 'reason' || k === 'netOrder' || k === 'layerRoles') {
          continue;
        }
        const v = String(o[k] ?? '');
        if (!isValidPcbLayerRole(v)) {
          lookLikeRoles = false;
          break;
        }
        if (k.indexOf('.Cu') < 0 && k.indexOf('Cu') < 0) {
          lookLikeRoles = false;
          break;
        }
      }
      if (lookLikeRoles) {
        Logger.info(INSTR_TRACE_TAG, `${TAG} AUTO_AGENT_COERCE ${stage} bare-roles→layerRoles`);
        const wrap: Record<string, Object> = {};
        wrap['layerRoles'] = o;
        wrap['netOrder'] = [];
        wrap['reason'] = 'coerced_bare_layerRoles';
        return wrap;
      }
    } else if (!hasOrder) {
      o['netOrder'] = [];
      if (o['reason'] === undefined) {
        o['reason'] = 'coerced_empty_netOrder';
      }
      return o;
    }
  }
  return parsed;
}

function numField(row: Record<string, Object>, key: string): number | undefined {
  const v = row[key];
  if (v === undefined || v === null) {
    return undefined;
  }
  const n = typeof v === 'number' ? v : Number(String(v));
  if (isNaN(n)) {
    return undefined;
  }
  return n;
}

function parseAgentOps(obj: Object | undefined): PcbAutoAgentOp[] {
  const out: PcbAutoAgentOp[] = [];
  if (!(obj instanceof Array)) {
    return out;
  }
  const arr = obj as Object[];
  for (let i = 0; i < arr.length && out.length < 36; i++) {
    const raw: Object = arr[i];
    if (raw === undefined || raw === null || typeof raw !== 'object') {
      continue;
    }
    const row = raw as Record<string, Object>;
    const kind = String(row['op'] ?? '').trim();
    const net = String(row['net'] ?? '').trim();
    if (!isValidOpKind(kind) || net.length === 0) {
      continue;
    }
    const op: PcbAutoAgentOp = {
      op: kind as 'ripup' | 'clear_reroute' | 'force_hv' | 'swap_hv' |
        'via_at' | 'via_near' | 'seg' | 'guide_maze',
      net: net
    };
    if (row['h'] !== undefined) {
      op.h = String(row['h']);
    }
    if (row['v'] !== undefined) {
      op.v = String(row['v']);
    }
    const x = numField(row, 'x');
    const y = numField(row, 'y');
    const x2 = numField(row, 'x2');
    const y2 = numField(row, 'y2');
    if (x !== undefined) {
      op.x = x;
    }
    if (y !== undefined) {
      op.y = y;
    }
    if (x2 !== undefined) {
      op.x2 = x2;
    }
    if (y2 !== undefined) {
      op.y2 = y2;
    }
    if (row['layer'] !== undefined) {
      op.layer = String(row['layer']);
    }
    if (row['fromLayer'] !== undefined) {
      op.fromLayer = String(row['fromLayer']);
    }
    if (row['toLayer'] !== undefined) {
      op.toLayer = String(row['toLayer']);
    }
    out.push(op);
  }
  return out;
}

function situationBlock(ctx: PcbAutoRouteAgentContext): string {
  const parts: string[] = [];
  if (ctx.situationLines !== undefined && ctx.situationLines.length > 0) {
    parts.push('态势 situation：\n' + ctx.situationLines.join('\n'));
  }
  if (ctx.ratsDetails !== undefined && ctx.ratsDetails.length > 0) {
    parts.push('飞线 rats：\n' + ctx.ratsDetails.join('\n'));
  }
  if (ctx.padSamples !== undefined && ctx.padSamples.length > 0) {
    parts.push('焊盘 pads：\n' + ctx.padSamples.join('\n'));
  }
  if (ctx.errorDigests !== undefined && ctx.errorDigests.length > 0) {
    parts.push('诊断 errors：\n' + ctx.errorDigests.join('\n'));
  }
  return parts.length > 0 ? parts.join('\n\n') + '\n\n' : '';
}

/** 从飞线生成 guide_maze / via_near 兜底 ops */
function geometryOpsFromRats(ctx: PcbAutoRouteAgentContext): PcbAutoAgentOp[] {
  const ops: PcbAutoAgentOp[] = opsFromErrorDigests(ctx);
  const rats = ctx.ratsDetails !== undefined ? ctx.ratsDetails : [];
  const copper = ctx.copperLayers;
  const h = copper.length >= 2 ? copper[1] : (copper.length > 0 ? copper[0] : 'F.Cu');
  const v = copper.length >= 3 ? copper[2] : h;
  let n = 0;
  for (let i = 0; i < rats.length && n < 8; i++) {
    // name|a=(x,y)|b=(x,y)|span=
    const line = rats[i];
    const nameEnd = line.indexOf('|');
    if (nameEnd <= 0) {
      continue;
    }
    const net = line.substring(0, nameEnd);
    const aTag = line.indexOf('a=(');
    const bTag = line.indexOf('b=(');
    if (aTag < 0 || bTag < 0) {
      continue;
    }
    const aClose = line.indexOf(')', aTag);
    const bClose = line.indexOf(')', bTag);
    if (aClose < 0 || bClose < 0) {
      continue;
    }
    const aPair = line.substring(aTag + 3, aClose).split(',');
    const bPair = line.substring(bTag + 3, bClose).split(',');
    if (aPair.length < 2 || bPair.length < 2) {
      continue;
    }
    const ax = Number(aPair[0]);
    const ay = Number(aPair[1]);
    const bx = Number(bPair[0]);
    const by = Number(bPair[1]);
    if (isNaN(ax) || isNaN(ay) || isNaN(bx) || isNaN(by)) {
      continue;
    }
    ops.push({
      op: 'guide_maze', net: net,
      x: ax, y: ay, x2: bx, y2: by,
      layer: h, toLayer: v
    });
    ops.push({
      op: 'via_near', net: net,
      x: Math.round((ax + bx) / 2), y: Math.round((ay + by) / 2),
      fromLayer: h, toLayer: v
    });
    n++;
  }
  return ops;
}

/** 诊断兜底：撕阻挡 + 清失败网重布 + 可选强制换层 */
function opsFromErrorDigests(ctx: PcbAutoRouteAgentContext): PcbAutoAgentOp[] {
  const ops: PcbAutoAgentOp[] = [];
  const rip = ripupFromErrorDigests(ctx, 8);
  for (let i = 0; i < rip.length; i++) {
    ops.push({ op: 'ripup', net: rip[i] });
  }
  const failKeys = failNetKeysFromCtx(ctx);
  const seen: Record<string, boolean> = {};
  let clearN = 0;
  for (let i = 0; i < failKeys.length && clearN < 10; i++) {
    const k = failKeys[i];
    if (k.indexOf('net_') !== 0 || seen[k]) {
      continue;
    }
    seen[k] = true;
    ops.push({ op: 'clear_reroute', net: k });
    clearN++;
  }
  // 名称级失败（无 net_）也清重布
  if (clearN === 0) {
    for (let i = 0; i < failKeys.length && clearN < 10; i++) {
      const k = failKeys[i];
      if (seen[k]) {
        continue;
      }
      seen[k] = true;
      ops.push({ op: 'clear_reroute', net: k });
      clearN++;
    }
  }
  const pref = preferLayerFromDigests(ctx);
  if (pref !== undefined) {
    let alt = pref;
    for (let i = 0; i < ctx.copperLayers.length; i++) {
      if (ctx.copperLayers[i] !== pref && ctx.copperLayers[i].indexOf('In') === 0) {
        alt = ctx.copperLayers[i];
        break;
      }
    }
    let forceN = 0;
    const forced: Record<string, boolean> = {};
    for (let i = 0; i < failKeys.length && forceN < 8; i++) {
      const k = failKeys[i];
      if (forced[k]) {
        continue;
      }
      forced[k] = true;
      ops.push({ op: 'force_hv', net: k, h: pref, v: alt });
      forceN++;
    }
  }
  return ops;
}

/** Strategy.onFail */
function buildRipupPrompt(ctx: PcbAutoRouteAgentContext): string {
  // 勿塞全量 rats/pads：7k+ prompt 易让 flash 挂到 readTimeout（曾 10min Operation timeout）
  const system =
    HARD_REPLY_CONTRACT +
    '你是 PCB Strategy Agent（拆线/重试决策，不画线）。\n' +
    '【本阶段必填】外层必须是对象，且含 ops 或 ripupTargets 或 retryNetOrder（至少一个非空数组）。\n' +
    '禁止只输出单个 op 对象（如 {"op":"force_hv",...}）；必须写成 {"ops":[{...}]}。\n' +
    'ops：ripup|clear_reroute|force_hv|swap_hv|via_at|via_near|seg|guide_maze。\n' +
    '对症 track_cross：ripup 同组 XTAL1/挡线网，再 clear_reroute+force_hv 失败网。\n' +
    '勿 rip GND/VCC。content 直接短 JSON（≤12 条 ops）；禁止长 reasoning。';
  const user =
    `铜层: ${JSON.stringify(ctx.copperLayers)}\n\n` +
    '失败网 failed：\n' +
    `${failSummaryLines(ctx)}\n\n` +
    '诊断 errors：\n' +
    `${errorDigestLines(ctx)}\n\n` +
    '正确示例：\n' +
    '{"ops":[{"op":"ripup","net":"S2_XTAL1"},{"op":"via_near","net":"S4_XTAL2","x":1200,"y":3600,' +
    '"fromLayer":"In1.Cu","toLayer":"In2.Cu"},{"op":"guide_maze","net":"S4_XTAL2","x":175,"y":3948,' +
    '"x2":1270,"y2":3626,"layer":"In1.Cu","toLayer":"In2.Cu"}],' +
    '"retryNetOrder":["S4_XTAL2"],"reason":"撕挡+过孔+maze"}\n\n' +
    '现在立即只输出 JSON：';
  return `${system}\n\n${user}`;
}

/** Routing：LLM 全权几何（对齐原理图）— 用 seg/via 直接画线，本地只校验 clearance */
function buildSalvagePrompt(ctx: PcbAutoRouteAgentContext): string {
  const rats = ctx.ratsDetails !== undefined ? ctx.ratsDetails : [];
  const ratsBlock = rats.length > 0
    ? ('飞线坐标（优先按此画 seg/via）：\n' + rats.slice(0, 24).join('\n') + '\n\n')
    : '';
  const system =
    HARD_REPLY_CONTRACT +
    '你是 PCB Routing Agent（LLM 全权几何，类似原理图连线：你出坐标，本地只做 clearance 校验）。\n' +
    '【本阶段必填】外层 {"ops":[...]}，ops 非空；禁止裸 {"op":...} 或空 content。\n' +
    '优先输出 seg / via_at / via_near（直接落铜）；可辅 guide_maze / force_hv / ripup / clear_reroute。\n' +
    '每条未通飞线至少 1 条 seg 或 via+seg；正交折线用多段 seg。\n' +
    '对症 track_cross：先 ripup 挡线网，再 seg/via 重画失败网。\n' +
    '禁止板外坐标与 GND/VCC ripup。content 直接短 JSON（≤16 条 ops）；禁止长 reasoning。';
  const user =
    '残留失败网：\n' +
    `${failSummaryLines(ctx)}\n\n` +
    ratsBlock +
    '诊断 errors：\n' +
    `${errorDigestLines(ctx)}\n\n` +
    '正确示例：\n' +
    '{"ops":[{"op":"seg","net":"HYST","x":210,"y":347,"x2":215,"y2":347,"layer":"In1.Cu"},' +
    '{"op":"via_at","net":"HYST","x":215,"y":347,"fromLayer":"In1.Cu","toLayer":"In2.Cu"},' +
    '{"op":"seg","net":"HYST","x":215,"y":347,"x2":431,"y2":347,"layer":"In2.Cu"},' +
    '{"op":"seg","net":"HYST","x":431,"y":347,"x2":431,"y2":135,"layer":"In2.Cu"}],' +
    '"retryNetOrder":["HYST"],"reason":"llm_seg"}\n\n' +
    '现在立即只输出 JSON：';
  return `${system}\n\n${user}`;
}

function situationLooksLikeMcuXtal(ctx: PcbAutoRouteAgentContext): boolean {
  const lines = ctx.situationLines !== undefined ? ctx.situationLines : [];
  const blob = lines.join('|') + '|' + (ctx.netSummaries !== undefined ? ctx.netSummaries.join('|') : '');
  if (blob.indexOf('|Y') >= 0) {
    return true;
  }
  if (blob.indexOf('_XTAL') >= 0 || blob.indexOf('XTAL') >= 0) {
    return true;
  }
  // fps 行：…|Y1|FP_HC49|…
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('|Y') >= 0 || lines[i].indexOf('FP_HC49') >= 0) {
      return true;
    }
  }
  return false;
}

function buildPlacementPrompt(ctx: PcbAutoRouteAgentContext): string {
  const mcu = situationLooksLikeMcuXtal(ctx);
  const system =
    HARD_REPLY_CONTRACT +
    '你是 PCB Placement Agent（布局优化，可改元器件位姿，允许整板重排）。\n' +
    '输出 JSON 外层必须含 decision=keep|revise|relayout（禁止只输出单个 footprint 对象）。\n' +
    'decision 含义：\n' +
    '- keep：不改位姿，placements=[]\n' +
    '- revise：增量调整少数器件（可只列要动的 footprint）\n' +
    '- relayout：整板重新排布；placements 须覆盖态势 movable 列表中几乎全部 id（安装孔除外），\n' +
    '  可大幅改 x/y/rotationDeg，按信号流/列式重新分区，不要复制现有坐标。\n' +
    '字段 placements[].footprintId,x,y,rotationDeg；footprintId 必须逐字复制 fps/movable。\n' +
    '可选 boardWidthMil/boardHeightMil（省略则保持现板框）；可选 estimatedCompletionRate(0-1)。\n' +
    '安装孔由系统钉四角，勿写入 placements。连接器可靠板边；其余功能件勿贴边框。\n' +
    '决策必须结合：网络 pads/质心、飞线 rats（span 长的优先缩短）、congHot 拥塞热点（器件远离 HIGH 热点）。\n' +
    '布通低 / rats 多 / 器件交叉时优先 relayout，不要只微调。\n' +
    (mcu ? MCU_COLUMN_PLACE_RECIPE : '按信号流紧凑摆放：相关阻容贴近 IC，连接器靠板边。\n');
  const failBlock = ctx.failSummaries !== undefined && ctx.failSummaries.length > 0
    ? ('未连通网：\n' + ctx.failSummaries.join('\n') + '\n\n')
    : '';
  const user =
    knowledgeHintsBlock(ctx) +
    situationBlock(ctx) +
    `铜层: ${JSON.stringify(ctx.copperLayers)}\n` +
    `placeRound: ${ctx.placeRound !== undefined ? ctx.placeRound : 0}\n` +
    (ctx.metricsSummary !== undefined && ctx.metricsSummary.length > 0
      ? `指标: ${ctx.metricsSummary}\n` : '') +
    failBlock +
    '网络摘要（id|name|pads|质心c）：\n' +
    `${ctx.netSummaries.join('\n')}\n\n` +
    '正确示例：\n' +
    (mcu
      ? '{"decision":"relayout","placements":[' +
        '{"footprintId":"fp_u1","x":1200,"y":1800,"rotationDeg":0},' +
        '{"footprintId":"fp_y1","x":720,"y":1640,"rotationDeg":0},' +
        '{"footprintId":"fp_cx01","x":660,"y":1480,"rotationDeg":180},' +
        '{"footprintId":"fp_r1","x":900,"y":2000,"rotationDeg":0}],' +
        '"estimatedCompletionRate":0.98,"reason":"整板列式重排"}\n'
      : '{"decision":"relayout","placements":[' +
        '{"footprintId":"fp_u1","x":400,"y":400,"rotationDeg":0},' +
        '{"footprintId":"fp_r1","x":520,"y":360,"rotationDeg":0},' +
        '{"footprintId":"fp_c1","x":520,"y":440,"rotationDeg":0}],' +
        '"estimatedCompletionRate":0.95,"reason":"整板按信号流重排"}\n') +
    '增量：{"decision":"revise","placements":[{"footprintId":"fp_y1","x":700,"y":1600,"rotationDeg":0}],' +
    '"reason":"仅拉近晶振"}\n' +
    '或 keep：{"decision":"keep","placements":[],"reason":"布局已可布"}\n\n' +
    '现在立即只输出 JSON：';
  return `${system}\n\n${user}`;
}

function buildCriticPrompt(ctx: PcbAutoRouteAgentContext): string {
  const metrics = ctx.metricsSummary !== undefined ? ctx.metricsSummary : '';
  const system =
    HARD_REPLY_CONTRACT +
    '你是 PCB Critic Agent（质量评审，不布线不改布局）。\n' +
    '输出 JSON：overallScore(0-100), layoutIssue(bool), notes(string)。\n' +
    '可选 suggestedRipup / suggestedRetryOrder 数组。\n' +
    'layoutIssue=true 仅当未布通主因是元器件摆放/拥塞热点（非单纯缺拆线策略）。';
  const user =
    knowledgeHintsBlock(ctx) +
    situationBlock(ctx) +
    `指标: ${metrics}\n` +
    '未连通：\n' +
    `${failSummaryLines(ctx)}\n\n` +
    '正确示例：\n' +
    '{"overallScore":72,"layoutIssue":true,"notes":"BGA东侧过堵","suggestedRipup":[],' +
    '"suggestedRetryOrder":["net_a"]}\n\n' +
    '现在立即只输出 JSON：';
  return `${system}\n\n${user}`;
}

function checkPlacementSchema(obj: Record<string, Object>): string | null {
  const d = String(obj['decision'] ?? '');
  if (d !== 'keep' && d !== 'revise' && d !== 'relayout') {
    return 'decision 须为 keep|revise|relayout';
  }
  if (d === 'revise' || d === 'relayout') {
    if (!(obj['placements'] instanceof Array)) {
      return `${d} 须含 placements 数组`;
    }
    const n = (obj['placements'] as Object[]).length;
    if (d === 'relayout' && n < 2) {
      return 'relayout 须含至少 2 条 placements（整板重排）';
    }
    // 裸单 footprint 被 coerce 成 revise：半截无效，逼 LLM 重发完整 relayout
    const reason = String(obj['reason'] ?? '');
    if (d === 'revise' && n < 2 && reason.indexOf('coerced_bare') >= 0) {
      return '禁止半截单 footprint；须 decision=relayout 且 placements 覆盖 IC+阻容+连接器';
    }
  }
  return null;
}

function checkCriticSchema(obj: Record<string, Object>): string | null {
  if (obj['overallScore'] === undefined || obj['overallScore'] === null) {
    return '缺少 overallScore';
  }
  if (obj['layoutIssue'] === undefined || obj['layoutIssue'] === null) {
    return '缺少 layoutIssue';
  }
  if (obj['notes'] === undefined) {
    return '缺少 notes';
  }
  return null;
}

function parsePlacementAdvice(obj: Record<string, Object>, fromLlm: boolean): PcbPlacementAgentAdvice {
  const decisionRaw = String(obj['decision'] ?? 'keep').trim().toLowerCase();
  const decision = decisionRaw === 'relayout' ? 'relayout' :
    (decisionRaw === 'revise' ? 'revise' : 'keep');
  const items: PcbPlacementItem[] = [];
  const raw = obj['placements'];
  if (raw instanceof Array) {
    for (let i = 0; i < raw.length && items.length < 128; i++) {
      const row = raw[i] as Record<string, Object>;
      if (row === undefined || row === null) {
        continue;
      }
      const id = String(row['footprintId'] ?? '').trim();
      if (id.length === 0) {
        continue;
      }
      const x = numField(row, 'x');
      const y = numField(row, 'y');
      const rot = numField(row, 'rotationDeg');
      if (x === undefined || y === undefined) {
        continue;
      }
      const item: PcbPlacementItem = {
        footprintId: id,
        x: x,
        y: y,
        rotationDeg: rot !== undefined ? rot : 0
      };
      items.push(item);
    }
  }
  const plan: PcbPlacementPlan = {
    fromLlm: fromLlm,
    placements: items,
    decision: decision,
    reason: obj['reason'] !== undefined ? String(obj['reason']) : undefined
  };
  const bw = numField(obj, 'boardWidthMil');
  const bh = numField(obj, 'boardHeightMil');
  if (bw !== undefined && bw > 0) {
    plan.boardWidthMil = bw;
  }
  if (bh !== undefined && bh > 0) {
    plan.boardHeightMil = bh;
  }
  const est = numField(obj, 'estimatedCompletionRate');
  const advice: PcbPlacementAgentAdvice = {
    fromLlm: fromLlm,
    fromLocal: !fromLlm,
    plan: plan,
    estimatedCompletionRate: est,
    reason: plan.reason
  };
  return advice;
}

function localCritic(ctx: PcbAutoRouteAgentContext): PcbCriticReport {
  const metrics = ctx.metricsSummary !== undefined ? ctx.metricsSummary : '';
  let unrouted = 0;
  const uKey = 'unrouted=';
  const ui = metrics.indexOf(uKey);
  if (ui >= 0) {
    let end = ui + uKey.length;
    while (end < metrics.length) {
      const ch = metrics.charAt(end);
      if (ch === ' ' || ch === '%' || ch === 't' || ch === 'v' || ch === 'd') {
        break;
      }
      end++;
    }
    unrouted = Number(metrics.substring(ui + uKey.length, end));
    if (isNaN(unrouted)) {
      unrouted = 0;
    }
  }
  let completion = 100;
  const cKey = 'completion=';
  const ci = metrics.indexOf(cKey);
  if (ci >= 0) {
    let end = ci + cKey.length;
    while (end < metrics.length) {
      const ch = metrics.charAt(end);
      if (ch === ' ' || ch === '%' || ch === 'u') {
        break;
      }
      end++;
    }
    completion = Number(metrics.substring(ci + cKey.length, end));
    if (isNaN(completion)) {
      completion = 100;
    }
  }
  const fails = ctx.failSummaries !== undefined ? ctx.failSummaries.length : 0;
  const layoutIssue = unrouted >= 3 || (completion < 90 && fails >= 2);
  const score = Math.max(0, Math.min(100, Math.round(completion - unrouted * 2)));
  const report: PcbCriticReport = {
    fromLlm: false,
    fromLocal: true,
    overallScore: score,
    layoutIssue: layoutIssue,
    notes: `local critic unrouted=${unrouted} fails=${fails}`,
    suggestedRetryOrder: failNetKeysFromCtx(ctx).slice(0, 12)
  };
  return report;
}

function localKnowledge(ctx: PcbAutoRouteAgentContext): PcbKnowledgeSnapshot {
  const hints: string[] = [
    '信号/晶振网优先于电源网布线',
    '任意 Cu 数：每一铜层都必须有走线（第1层 stub，中间 H/V 交替，末层 power_h）',
    '勿拆 GND/VCC；track_cross 优先撕同组挡线',
    'BGA/连接器周围预留逃逸通道',
    '几何优先由 LLM 出 seg/via（类原理图），本地 maze 只补洞'
  ];
  const cuN = ctx.copperLayers.length;
  if (cuN >= 2) {
    hints.push(`当前 ${cuN} 层：layerRoles 必须覆盖全部 ${cuN} 个铜层且每层参与布线`);
  }
  if (situationLooksLikeMcuXtal(ctx)) {
    hints.push('多MCU：按模板列式手摆 — Y/CX 贴 OSC 侧短连');
    hints.push('多MCU手布：先电源H/V干线+XTAL分跳+NRST外侧+LED B绕，再AUTO补剩余');
  }
  const snap: PcbKnowledgeSnapshot = {
    ruleHints: hints,
    designSummary: (ctx.situationLines !== undefined ? ctx.situationLines.join('; ') : '').substring(0, 200),
    sessionNotes: SESSION_EXPERIENCE.length <= 8
      ? SESSION_EXPERIENCE.slice()
      : SESSION_EXPERIENCE.slice(SESSION_EXPERIENCE.length - 8)
  };
  return snap;
}

function parseStrategyOnFail(obj: Record<string, Object> | null,
  ctx: PcbAutoRouteAgentContext): PcbAutoRipupAdvice | null {
  const failKeys = failNetKeysFromCtx(ctx);
  const digestRipup = ripupFromErrorDigests(ctx, 8);
  const digestLayer = preferLayerFromDigests(ctx);
  const digestOps = opsFromErrorDigests(ctx);

  // API 取消/未拿到 LLM：不退回 digest LOCAL，由上层继续等下一轮 LLM
  if (obj === null) {
    Logger.warn(INSTR_TRACE_TAG,
      `${TAG} strategyOnFail null (no LOCAL digest; wait LLM)`);
    return null;
  }

  let retry = parseStringArray(obj['retryNetOrder']);
  let ripup = parseStringArray(obj['ripupTargets']);
  let ops = parseAgentOps(obj['ops']);
  if (ops.length === 0 && digestOps.length > 0) {
    ops = digestOps;
  }
  if (ripup.length === 0 && digestRipup.length > 0) {
    ripup = digestRipup;
  }
  if (retry.length === 0 && ripup.length > 0) {
    retry = ripup.slice();
  }
  if (retry.length === 0 && failKeys.length > 0) {
    const ids: string[] = [];
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < failKeys.length; i++) {
      const k = failKeys[i];
      if (k.indexOf('net_') === 0 && !seen[k]) {
        seen[k] = true;
        ids.push(k);
      }
    }
    retry = ids.length > 0 ? ids : failKeys.filter((_k: string, idx: number) => idx % 2 === 0);
  }
  let bias = coerceCorridorBias(obj, failKeys);
  if (Object.keys(bias).length === 0 && digestLayer !== undefined) {
    const one: PcbCorridorBias = { preferLayer: digestLayer };
    for (let i = 0; i < failKeys.length; i++) {
      bias[failKeys[i]] = one;
    }
  }
  const advice: PcbAutoRipupAdvice = {
    fromLlm: true,
    ripupTargets: ripup,
    corridorBias: bias,
    retryNetOrder: retry,
    ops: ops,
    reason: obj['reason'] !== undefined ? String(obj['reason']) : undefined
  };
  return advice;
}

/** 有默认 API Key 时构造五 Agent；否则返回 null */
export function createPcbRouteAgents(api: IAiApiManager): PcbRouteAgentBundle | null {
  const def = api.getDefaultApi();
  if (!def.success || def.data === undefined) {
    return null;
  }
  const key = (def.data.apiKey ?? '').trim();
  if (key.length === 0) {
    return null;
  }

  const bundle: PcbRouteAgentBundle = {
    knowledgePrepare: async (ctx: PcbAutoRouteAgentContext): Promise<PcbKnowledgeSnapshot | null> => {
      return localKnowledge(ctx);
    },
    knowledgeRecord: (_ctx: PcbAutoRouteAgentContext, resultSummary: string): void => {
      SESSION_EXPERIENCE.push(resultSummary.substring(0, 160));
      while (SESSION_EXPERIENCE.length > 24) {
        SESSION_EXPERIENCE.shift();
      }
    },
    placementOptimize: async (ctx: PcbAutoRouteAgentContext): Promise<PcbPlacementAgentAdvice | null> => {
      const obj = await chatJsonHard(
        api, buildPlacementPrompt(ctx), TIMEOUT_GLOBAL_MS, 'placement', checkPlacementSchema);
      // 仅用户取消会 null；不退回 local_keep
      if (obj === null) {
        Logger.warn(INSTR_TRACE_TAG, `${TAG} placement cancelled (no LOCAL keep)`);
        return null;
      }
      return parsePlacementAdvice(obj, true);
    },
    strategyPlan: async (ctx: PcbAutoRouteAgentContext): Promise<PcbAutoGlobalAdvice | null> => {
      const copper = ctx.copperLayers;
      const obj = await chatJsonHard(
        api, buildGlobalPrompt(ctx), TIMEOUT_GLOBAL_MS, 'strategyPlan',
        (o: Record<string, Object>): string | null => checkGlobalSchema(o, copper));
      if (obj === null) {
        Logger.warn(INSTR_TRACE_TAG, `${TAG} strategyPlan cancelled (no LOCAL)`);
        return null;
      }
      const roles = parseLayerRoles(obj['layerRoles'], copper);
      if (roles === null) {
        return null;
      }
      let order = parseStringArray(obj['netOrder']);
      if (order.length === 0) {
        order = synthesizeNetOrder(ctx.netSummaries);
      }
      const advice: PcbAutoGlobalAdvice = {
        fromLlm: true,
        layerRoles: roles,
        netOrder: order,
        reason: obj['reason'] !== undefined ? String(obj['reason']) : 'llm'
      };
      return advice;
    },
    strategyOnFail: async (ctx: PcbAutoRouteAgentContext): Promise<PcbAutoRipupAdvice | null> => {
      const obj = await chatJsonHard(
        api, buildRipupPrompt(ctx), TIMEOUT_RIPUP_MS, 'strategyOnFail', checkRipupSchema);
      return parseStrategyOnFail(obj, ctx);
    },
    routingSalvage: async (ctx: PcbAutoRouteAgentContext): Promise<PcbAutoGeometryAdvice | null> => {
      const obj = await chatJsonHard(
        api, buildSalvagePrompt(ctx), TIMEOUT_SALVAGE_MS, 'routingSalvage', checkGeometrySchema);
      if (obj === null) {
        Logger.warn(INSTR_TRACE_TAG, `${TAG} routingSalvage cancelled (no LOCAL rats)`);
        return null;
      }
      const ops = parseAgentOps(obj['ops']);
      return {
        fromLlm: true,
        ops: ops,
        retryNetOrder: parseStringArray(obj['retryNetOrder']),
        reason: obj['reason'] !== undefined ? String(obj['reason']) : undefined
      };
    },
    criticReview: async (ctx: PcbAutoRouteAgentContext): Promise<PcbCriticReport | null> => {
      const obj = await chatJsonHard(
        api, buildCriticPrompt(ctx), TIMEOUT_QA_MS, 'critic', checkCriticSchema);
      if (obj === null) {
        Logger.warn(INSTR_TRACE_TAG, `${TAG} critic cancelled (no LOCAL critic)`);
        return null;
      }
      const scoreRaw = numField(obj, 'overallScore');
      const layoutIssue = obj['layoutIssue'] === true || String(obj['layoutIssue']) === 'true';
      const report: PcbCriticReport = {
        fromLlm: true,
        overallScore: scoreRaw !== undefined ? scoreRaw : 50,
        layoutIssue: layoutIssue,
        notes: String(obj['notes'] ?? ''),
        suggestedRipup: parseStringArray(obj['suggestedRipup']),
        suggestedRetryOrder: parseStringArray(obj['suggestedRetryOrder'])
      };
      return report;
    }
  };
  return bundle;
}

/** @deprecated 使用 createPcbRouteAgents */
export function createPcbAutoRouteHooks(api: IAiApiManager): PcbRouteAgentBundle | null {
  return createPcbRouteAgents(api);
}

/** 须已配置默认 API 且 apiKey 非空（与原理图共用） */
export function hasPcbAutoRouteApiKey(api: IAiApiManager): boolean {
  const def = api.getDefaultApi();
  if (!def.success || def.data === undefined) {
    return false;
  }
  return (def.data.apiKey ?? '').trim().length > 0;
}
