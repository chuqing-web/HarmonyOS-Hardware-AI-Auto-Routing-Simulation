/**
 * PCB LLM 回复门禁：拒绝散文 / 空壳，把杂质摘要写入失败原因供 KEEP_RETRY。
 */
import { Logger, INSTR_TRACE_TAG, PcbDocument } from 'common';
import { PromptLoader } from '../../prompts/PromptLoader';

/** 非纯 JSON 对象 → 返回带杂质摘要的失败原因；通过则 null */
export function pcbImpureReplyReason(stage: string, data: string): string | null {
  if (PromptLoader.isStrictJsonObjectReply(data)) {
    return null;
  }
  const impurity = PromptLoader.describeJsonImpurity(data);
  const preview = data.trim().substring(0, 100).replace(/\s+/g, ' ');
  Logger.warn(INSTR_TRACE_TAG,
    `[AI_PCB] ${stage} impure reply (${impurity}) preview=${preview}`);
  return `${stage} LLM JSON invalid (${impurity})`;
}

export function isPcbJsonInvalidReason(reason: string): boolean {
  const m = reason.toLowerCase();
  return m.indexOf('json invalid') >= 0
    || m.indexOf('impure reply') >= 0
    || m.indexOf('non-json body') >= 0;
}

/** 几何未落板：勿进 QA（无铜可修） */
export function shouldSkipQaAfterGeometryFail(reason: string): boolean {
  if (isPcbJsonInvalidReason(reason)) {
    return true;
  }
  const m = reason.toLowerCase();
  return m.indexOf('trivial coverage') >= 0
    || m.indexOf('geometry llm failed') >= 0
    || m.indexOf('geometry never applied') >= 0;
}

/**
 * 将 LLM 给的 footprintId / refDes / pad 引用（U1.39）归一成真实 fp.id。
 * 全部无法解析时返回空数组（调用方应跳过 re-place，避免全锁失败）。
 */
export function normalizeRePlaceFootprintIds(raw: string[], doc: PcbDocument): string[] {
  const byId: Set<string> = new Set();
  const byRef: Map<string, string> = new Map();
  for (let i = 0; i < doc.footprints.length; i++) {
    const fp = doc.footprints[i];
    byId.add(fp.id);
    if (fp.refDes && fp.refDes.length > 0) {
      byRef.set(fp.refDes, fp.id);
      byRef.set(fp.refDes.toUpperCase(), fp.id);
    }
  }
  const out: string[] = [];
  const seen: Set<string> = new Set();
  const rejected: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = (raw[i] ?? '').trim();
    if (s.length === 0) {
      continue;
    }
    let id = '';
    if (byId.has(s)) {
      id = s;
    } else if (byRef.has(s) || byRef.has(s.toUpperCase())) {
      id = byRef.get(s) ?? byRef.get(s.toUpperCase()) ?? '';
    } else {
      // pad 引用 RefDes.PadNum（如 U1.39）
      const dot = s.lastIndexOf('.');
      if (dot > 0) {
        const ref = s.substring(0, dot);
        const padPart = s.substring(dot + 1);
        if (/^\d+$/.test(padPart) && (byRef.has(ref) || byRef.has(ref.toUpperCase()))) {
          id = byRef.get(ref) ?? byRef.get(ref.toUpperCase()) ?? '';
        }
      }
    }
    if (id.length === 0) {
      rejected.push(s);
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  if (rejected.length > 0) {
    Logger.warn(INSTR_TRACE_TAG,
      `[AI_PCB] qa_repair rePlaceFootprintIds rejected=${rejected.slice(0, 6).join(',')}` +
      `${rejected.length > 6 ? '…' : ''} kept=${out.length}`);
  }
  return out;
}

/** 统计未绑定 net 的焊盘，供几何提示 */
export function countFloatPads(doc: PcbDocument): number {
  let n = 0;
  for (let i = 0; i < doc.footprints.length; i++) {
    const fp = doc.footprints[i];
    for (let j = 0; j < fp.pads.length; j++) {
      const nid = fp.pads[j].netId ?? '';
      if (nid.length === 0) {
        n++;
      }
    }
  }
  return n;
}
