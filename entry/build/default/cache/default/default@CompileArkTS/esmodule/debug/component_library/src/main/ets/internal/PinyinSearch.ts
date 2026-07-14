/**
 * 拼音搜索辅助 — 常用器件中文名 → 拼音键
 */
const PINYIN_MAP: Map<string, string[]> = new Map([
    ['电阻', ['dianzu', 'dian', 'zu', 'resistor', 'r']],
    ['电容', ['dianrong', 'dian', 'rong', 'capacitor', 'c']],
    ['电感', ['diangan', 'inductor', 'l']],
    ['二极管', ['erjiguan', 'diode', 'd']],
    ['三极管', ['sanjiguan', 'transistor', 'q']],
    ['单片机', ['danpianji', 'mcu', 'cpu']],
    ['晶振', ['jingzhen', 'crystal', 'osc']],
    ['led', ['led', 'faguang']],
    ['stm32', ['stm32', 'stm']],
    ['8051', ['8051', 'at89', '51']],
    ['运放', ['yunfang', 'opamp', 'lm358']],
    ['逻辑', ['luoji', 'logic', '74hc']],
    ['连接器', ['lianjieqi', 'connector', 'header']],
    ['开关', ['kaiguan', 'switch']],
    ['继电器', ['jidianqi', 'relay']],
]);
export function expandPinyinTokens(keyword: string): string[] {
    const lower = keyword.toLowerCase();
    const tokens: string[] = [lower];
    PINYIN_MAP.forEach((pinyins: string[], chinese: string) => {
        for (let i = 0; i < pinyins.length; i++) {
            if (pinyins[i].includes(lower) || lower.includes(pinyins[i])) {
                tokens.push(chinese);
                for (let j = 0; j < pinyins.length; j++)
                    tokens.push(pinyins[j]);
            }
        }
    });
    return tokens;
}
export function matchesPinyin(text: string, keyword: string): boolean {
    const tokens = expandPinyinTokens(keyword);
    const lowerText = text.toLowerCase();
    for (let i = 0; i < tokens.length; i++) {
        if (lowerText.includes(tokens[i]))
            return true;
    }
    return false;
}
