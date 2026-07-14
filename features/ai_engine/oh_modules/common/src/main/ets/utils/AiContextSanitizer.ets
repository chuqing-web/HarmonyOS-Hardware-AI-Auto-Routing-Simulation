/**
 * AI 对话上下文脱敏 — 发送前去除坐标/引脚等非必要信息
 */
export class AiContextSanitizer {
  static sanitizePrompt(text: string): string {
    let out = text;
    out = out.replace(/\b[xX]\s*[:=]?\s*\d+(\.\d+)?/g, 'x=<coord>');
    out = out.replace(/\b[yY]\s*[:=]?\s*\d+(\.\d+)?/g, 'y=<coord>');
    out = out.replace(/P\d+\.\d+/g, 'P<n>.<m>');
    out = out.replace(/0x[0-9A-Fa-f]{4,8}/g, '0x<addr>');
    out = out.replace(/\b\d{1,4}\s*mil\b/gi, '<dist>mil');
    return out;
  }

  static sanitizeTopologyJson(json: string): string {
    return AiContextSanitizer.sanitizePrompt(json)
      .replace(/"x"\s*:\s*[\d.]+/g, '"x":0')
      .replace(/"y"\s*:\s*[\d.]+/g, '"y":0');
  }
}
