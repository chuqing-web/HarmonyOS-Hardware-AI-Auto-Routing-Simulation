export interface DrawCommand {
    type: 'line' | 'rect' | 'circle' | 'text' | 'path';
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    r?: number;
    text?: string;
    color?: string;
    strokeWidth?: number;
    d?: string;
}
export class SvgSymbolCache {
    private static cache: Map<string, DrawCommand[]> = new Map();
    static get(c332: string): DrawCommand[] | null {
        return SvgSymbolCache.cache.get(c332) ?? null;
    }
    static put(a332: string, b332: DrawCommand[]): void {
        SvgSymbolCache.cache.set(a332, b332);
    }
    static parseSvgToCommands(u331: string): DrawCommand[] {
        const v331: DrawCommand[] = [];
        const w331 = /<line[^>]*x1="([\d.]+)"[^>]*y1="([\d.]+)"[^>]*x2="([\d.]+)"[^>]*y2="([\d.]+)"/gi;
        let x331: RegExpExecArray | null;
        while ((x331 = w331.exec(u331)) !== null) {
            v331.push({
                type: 'line',
                x1: parseFloat(x331[1]), y1: parseFloat(x331[2]),
                x2: parseFloat(x331[3]), y2: parseFloat(x331[4]),
                color: '#000', strokeWidth: 1
            });
        }
        const y331 = /<rect[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/gi;
        while ((x331 = y331.exec(u331)) !== null) {
            v331.push({
                type: 'rect',
                x: parseFloat(x331[1]), y: parseFloat(x331[2]),
                w: parseFloat(x331[3]), h: parseFloat(x331[4]),
                color: '#000', strokeWidth: 1
            });
        }
        const z331 = /<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"/gi;
        while ((x331 = z331.exec(u331)) !== null) {
            v331.push({ type: 'circle', x: parseFloat(x331[1]), y: parseFloat(x331[2]), r: parseFloat(x331[3]), color: '#000' });
        }
        return v331;
    }
    static preload(q331: string, r331: string): DrawCommand[] {
        const s331 = SvgSymbolCache.get(q331);
        if (s331)
            return s331;
        const t331 = SvgSymbolCache.parseSvgToCommands(r331);
        SvgSymbolCache.put(q331, t331);
        return t331;
    }
    static clear(): void { SvgSymbolCache.cache.clear(); }
}
