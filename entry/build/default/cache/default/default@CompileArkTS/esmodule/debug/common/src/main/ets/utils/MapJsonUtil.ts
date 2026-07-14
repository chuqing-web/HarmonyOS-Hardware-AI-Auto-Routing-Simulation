/**
 * Map-safe JSON 序列化/反序列化工具
 * 解决 JSON.stringify(Map) → {} 的数据丢失问题
 */
const MAP_MARKER = '__map__';
export function mapJsonReplacer(_key: string, value: Object): Object {
    if (value !== null && typeof value === 'object' && typeof (value as Record<string, Object>).set === 'function') {
        const mapObj: Record<string, Object> = {};
        mapObj[MAP_MARKER] = '1';
        (value as Map<string, Object>).forEach((v: Object, k: string) => {
            mapObj[k] = v;
        });
        return mapObj;
    }
    return value;
}
export function mapJsonReviver(_key: string, value: Object): Object {
    if (value !== null && typeof value === 'object') {
        const marker: string = (value as Record<string, Object>)[MAP_MARKER] as string;
        if (marker === '1') {
            const map = new Map<string, string>();
            const keys: string[] = Object.keys(value as Record<string, Object>);
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (k !== MAP_MARKER) {
                    map.set(k, (value as Record<string, Object>)[k] as string);
                }
            }
            return map;
        }
    }
    return value;
}
export function mapAwareStringify(obj: Object, pretty: boolean = false): string {
    if (pretty) {
        return JSON.stringify(obj, mapJsonReplacer, 2);
    }
    return JSON.stringify(obj, mapJsonReplacer);
}
export function mapAwareParse<T>(json: string): T {
    return JSON.parse(json, mapJsonReviver) as T;
}
export function serializeMap<V>(map: Map<string, V>): Record<string, Object> {
    const obj: Record<string, Object> = {};
    obj[MAP_MARKER] = '1';
    map.forEach((v: V, k: string) => {
        obj[k] = v as Object;
    });
    return obj;
}
export function deserializeStringMap(obj: Record<string, Object>): Map<string, string> {
    const map = new Map<string, string>();
    if (obj === null || obj === undefined) {
        return map;
    }
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k !== MAP_MARKER) {
            const val: string = obj[k] as string;
            map.set(k, typeof val === 'string' ? val : `${val}`);
        }
    }
    return map;
}
