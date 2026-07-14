/**
 * SVG 符号预解析缓存
 */
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
    static get(libraryId: string): DrawCommand[] | null {
        return SvgSymbolCache.cache.get(libraryId) ?? null;
    }
    static put(libraryId: string, commands: DrawCommand[]): void {
        SvgSymbolCache.cache.set(libraryId, commands);
    }
    static parseSvgToCommands(svg: string): DrawCommand[] {
        const cmds: DrawCommand[] = [];
        const lineRe = /<line[^>]*x1="([\d.]+)"[^>]*y1="([\d.]+)"[^>]*x2="([\d.]+)"[^>]*y2="([\d.]+)"/gi;
        let m: RegExpExecArray | null;
        while ((m = lineRe.exec(svg)) !== null) {
            cmds.push({
                type: 'line', x1: parseFloat(m[1]), y1: parseFloat(m[2]),
                x2: parseFloat(m[3]), y2: parseFloat(m[4]), color: '#000', strokeWidth: 1
            });
        }
        const rectRe = /<rect[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/gi;
        while ((m = rectRe.exec(svg)) !== null) {
            cmds.push({
                type: 'rect', x: parseFloat(m[1]), y: parseFloat(m[2]),
                w: parseFloat(m[3]), h: parseFloat(m[4]), color: '#000', strokeWidth: 1
            });
        }
        const circleRe = /<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"/gi;
        while ((m = circleRe.exec(svg)) !== null) {
            cmds.push({ type: 'circle', x: parseFloat(m[1]), y: parseFloat(m[2]), r: parseFloat(m[3]), color: '#000' });
        }
        return cmds;
    }
    static preload(libraryId: string, svgContent: string): DrawCommand[] {
        const cached = SvgSymbolCache.get(libraryId);
        if (cached)
            return cached;
        const cmds = SvgSymbolCache.parseSvgToCommands(svgContent);
        SvgSymbolCache.put(libraryId, cmds);
        return cmds;
    }
    static clear(): void { SvgSymbolCache.cache.clear(); }
}
