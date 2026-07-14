export class ProteusAliasLoader {
    private aliases: Map<string, string> = new Map();
    private vendorMaps: Map<string, Map<string, string>> = new Map();
    loadFromJson(c331: string): number {
        this.aliases.clear();
        this.vendorMaps.clear();
        try {
            const e331: Record<string, Object> = JSON.parse(c331) as Record<string, Object>;
            const f331: Record<string, Object> = e331['aliases'] as Record<string, Object>;
            if (f331) {
                const o331: string[] = Object.keys(f331);
                for (let p331 = 0; p331 < o331.length; p331++) {
                    this.aliases.set(o331[p331].toUpperCase(), f331[o331[p331]] as string);
                }
            }
            const g331: Record<string, Object> = e331['vendorMappings'] as Record<string, Object>;
            if (g331) {
                const h331 = Object.keys(g331);
                for (let i331 = 0; i331 < h331.length; i331++) {
                    const j331 = h331[i331];
                    const k331 = new Map<string, string>();
                    const l331: Record<string, Object> = g331[j331] as Record<string, Object>;
                    const m331 = Object.keys(l331);
                    for (let n331 = 0; n331 < m331.length; n331++) {
                        k331.set(m331[n331].toUpperCase(), l331[m331[n331]] as string);
                    }
                    this.vendorMaps.set(j331, k331);
                }
            }
            return this.aliases.size;
        }
        catch (d331) {
            return 0;
        }
    }
    resolve(v330: string, w330: string = ''): string {
        const x330 = v330.toUpperCase();
        const y330 = this.aliases.get(x330);
        if (y330)
            return y330;
        if (w330.length > 0) {
            const z330 = this.vendorMaps.get(w330);
            if (z330) {
                const a331 = Array.from(z330.keys());
                for (let b331 = 0; b331 < a331.length; b331++) {
                    if (x330.startsWith(a331[b331])) {
                        return z330.get(a331[b331]) ?? v330;
                    }
                }
            }
        }
        return v330;
    }
    getAliasCount(): number { return this.aliases.size; }
}
