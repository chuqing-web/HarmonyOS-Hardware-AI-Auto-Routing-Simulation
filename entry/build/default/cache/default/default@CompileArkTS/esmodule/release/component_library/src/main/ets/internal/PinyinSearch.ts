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
export function expandPinyinTokens(o330: string): string[] {
    const p330 = o330.toLowerCase();
    const q330: string[] = [p330];
    PINYIN_MAP.forEach((r330: string[], s330: string) => {
        for (let t330 = 0; t330 < r330.length; t330++) {
            if (r330[t330].includes(p330) || p330.includes(r330[t330])) {
                q330.push(s330);
                for (let u330 = 0; u330 < r330.length; u330++)
                    q330.push(r330[u330]);
            }
        }
    });
    return q330;
}
export function matchesPinyin(j330: string, k330: string): boolean {
    const l330 = expandPinyinTokens(k330);
    const m330 = j330.toLowerCase();
    for (let n330 = 0; n330 < l330.length; n330++) {
        if (m330.includes(l330[n330]))
            return true;
    }
    return false;
}
