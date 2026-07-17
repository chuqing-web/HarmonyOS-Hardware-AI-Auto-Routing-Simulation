/**
 * AI 对话上下文脱敏 — 发送前仅去除敏感地址类信息。
 *
 * 重要：生图布局/建网/纠错依赖精确 mil 与坐标数值。
 * 旧实现把 `80mil`→`<dist>mil`、`x:80`→`x=<coord>`，导致 LLM 无法按审查意见拉开间距。
 */
export class AiContextSanitizer {
  static sanitizePrompt(text: string): string {
    let out = text;
    // 仅脱敏疑似固件/寄存器地址；保留几何约束、坐标、通道宽度
    out = out.replace(/0x[0-9A-Fa-f]{4,8}/g, '0x<addr>');
    return out;
  }

  /** 拓扑 JSON 导出到非布局上下文时，可抹坐标（布局 chat 勿用） */
  static sanitizeTopologyJson(json: string): string {
    return AiContextSanitizer.sanitizePrompt(json)
      .replace(/"x"\s*:\s*[\d.]+/g, '"x":0')
      .replace(/"y"\s*:\s*[\d.]+/g, '"y":0');
  }
}
