const MAP_MARKER = '__map__';
export function mapJsonReplacer(b43: string, c43: Object): Object {
    if (c43 !== null && typeof c43 === 'object' && typeof (c43 as Record<string, Object>).set === 'function') {
        const d43: Record<string, Object> = {};
        d43[MAP_MARKER] = '1';
        (c43 as Map<string, Object>).forEach((e43: Object, f43: string) => {
            d43[f43] = e43;
        });
        return d43;
    }
    return c43;
}
export function mapJsonReviver(u42: string, v42: Object): Object {
    if (v42 !== null && typeof v42 === 'object') {
        const w42: string = (v42 as Record<string, Object>)[MAP_MARKER] as string;
        if (w42 === '1') {
            const x42 = new Map<string, string>();
            const y42: string[] = Object.keys(v42 as Record<string, Object>);
            for (let z42 = 0; z42 < y42.length; z42++) {
                const a43 = y42[z42];
                if (a43 !== MAP_MARKER) {
                    x42.set(a43, (v42 as Record<string, Object>)[a43] as string);
                }
            }
            return x42;
        }
    }
    return v42;
}
export function mapAwareStringify(s42: Object, t42: boolean = false): string {
    if (t42) {
        return JSON.stringify(s42, mapJsonReplacer, 2);
    }
    return JSON.stringify(s42, mapJsonReplacer);
}
export function mapAwareParse<q42>(r42: string): q42 {
    return JSON.parse(r42, mapJsonReviver) as q42;
}
export function serializeMap<l42>(m42: Map<string, l42>): Record<string, Object> {
    const n42: Record<string, Object> = {};
    n42[MAP_MARKER] = '1';
    m42.forEach((o42: l42, p42: string) => {
        n42[p42] = o42 as Object;
    });
    return n42;
}
export function deserializeStringMap(f42: Record<string, Object>): Map<string, string> {
    const g42 = new Map<string, string>();
    if (f42 === null || f42 === undefined) {
        return g42;
    }
    const h42 = Object.keys(f42);
    for (let i42 = 0; i42 < h42.length; i42++) {
        const j42 = h42[i42];
        if (j42 !== MAP_MARKER) {
            const k42: string = f42[j42] as string;
            g42.set(j42, typeof k42 === 'string' ? k42 : `${k42}`);
        }
    }
    return g42;
}
