export class BreakpointEvaluator {
    static evaluate(a366: string, b366: Map<string, number>, c366: (addr: number) => number): boolean {
        const d366 = a366.trim();
        if (d366.length === 0)
            return true;
        const e366 = d366.match(/^\*\(volatile\s+\w+\*\)(0x[0-9A-Fa-f]+)\s*&\s*(0x[0-9A-Fa-f]+)$/);
        if (e366) {
            const l366 = parseInt(e366[1], 16);
            const m366 = parseInt(e366[2], 16);
            return (c366(l366) & m366) !== 0;
        }
        const f366 = d366.match(/^(R\d+|PC|SP|LR|ACC)\s*([=!<>]+)\s*(0x[0-9A-Fa-f]+|\d+)$/i);
        if (f366) {
            const g366 = f366[1].toUpperCase();
            const h366 = f366[2];
            const i366 = f366[3];
            const j366 = i366.startsWith('0x') ? parseInt(i366, 16) : parseInt(i366, 10);
            const k366 = b366.get(g366) ?? b366.get(g366 === 'PC' ? 'R15' : g366) ?? 0;
            switch (h366) {
                case '==':
                case '=': return k366 === j366;
                case '!=': return k366 !== j366;
                case '>': return k366 > j366;
                case '<': return k366 < j366;
                case '>=': return k366 >= j366;
                case '<=': return k366 <= j366;
                default: return false;
            }
        }
        return true;
    }
}
