export interface ParsedPinRef {
    compId: string;
    pinId: string;
    pinName: string;
}
export function parsePinRef(e49: string): ParsedPinRef | null {
    if (e49.length === 0)
        return null;
    const f49 = e49.split(':');
    if (f49.length < 2) {
        return { compId: f49[0], pinId: '', pinName: '' };
    }
    return {
        compId: f49[0],
        pinId: f49[1],
        pinName: f49.length >= 3 ? f49[2] : f49[1]
    };
}
export function buildPinRef(b49: string, c49: string, d49: string): string {
    return `${b49}:${c49}:${d49}`;
}
export interface Net {
    id: string;
    pinIds: string[];
}
export function getPinNetMap(v48: string, w48: Net[]): Map<string, string> {
    const x48 = new Map<string, string>();
    for (const y48 of w48) {
        for (const z48 of y48.pinIds) {
            const a49 = parsePinRef(z48);
            if (a49 === null || a49.compId !== v48) {
                continue;
            }
            if (a49.pinName.length > 0) {
                x48.set(a49.pinName.toUpperCase(), y48.id);
            }
            if (a49.pinId.length > 0) {
                x48.set(a49.pinId.toUpperCase(), y48.id);
            }
        }
    }
    return x48;
}
export function findNetForPinLabel(t48: Map<string, string>, u48: string): string | null {
    if (u48.length === 0) {
        return null;
    }
    return t48.get(u48.toUpperCase()) ?? null;
}
