/**
 * 条件断点表达式求值器
 */
export class BreakpointEvaluator {
  static evaluate(expr: string, regs: Map<string, number>, readMem: (addr: number) => number): boolean {
    const trimmed = expr.trim();
    if (trimmed.length === 0) return true;

    const derefMatch = trimmed.match(/^\*\(volatile\s+\w+\*\)(0x[0-9A-Fa-f]+)\s*&\s*(0x[0-9A-Fa-f]+)$/);
    if (derefMatch) {
      const addr = parseInt(derefMatch[1], 16);
      const mask = parseInt(derefMatch[2], 16);
      return (readMem(addr) & mask) !== 0;
    }

    const cmpMatch = trimmed.match(/^(R\d+|PC|SP|LR|ACC)\s*([=!<>]+)\s*(0x[0-9A-Fa-f]+|\d+)$/i);
    if (cmpMatch) {
      const regName = cmpMatch[1].toUpperCase();
      const op = cmpMatch[2];
      const valStr = cmpMatch[3];
      const expected = valStr.startsWith('0x') ? parseInt(valStr, 16) : parseInt(valStr, 10);
      const actual = regs.get(regName) ?? regs.get(regName === 'PC' ? 'R15' : regName) ?? 0;
      switch (op) {
        case '==': case '=': return actual === expected;
        case '!=': return actual !== expected;
        case '>': return actual > expected;
        case '<': return actual < expected;
        case '>=': return actual >= expected;
        case '<=': return actual <= expected;
        default: return false;
      }
    }

    return true;
  }
}
