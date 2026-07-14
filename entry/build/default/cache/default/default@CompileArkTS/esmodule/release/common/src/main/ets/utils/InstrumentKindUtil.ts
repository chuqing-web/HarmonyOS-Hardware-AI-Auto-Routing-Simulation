export function detectInstrumentKind(g25: string): string {
    if (g25.length === 0) {
        return '';
    }
    const h25 = g25.toUpperCase();
    if (h25.includes('OSC') || h25.includes('SCOPE')) {
        return 'osc';
    }
    if (h25.includes('LOGIC') || h25.includes('ANALYZER') || h25.startsWith('LA')) {
        return 'logic';
    }
    if (h25.includes('VIRTUAL_METER') || h25 === 'MULTIMETER') {
        return 'dmm';
    }
    if (h25.includes('VOLTMETER')) {
        return 'vm';
    }
    if (h25.includes('AMMETER') || (h25.includes('AMP') && h25.includes('METER'))) {
        return 'am';
    }
    if (h25.includes('POWER') || h25.includes('WATT')) {
        return 'power';
    }
    if (h25.includes('FREQ') || h25.includes('COUNTER')) {
        return 'freq';
    }
    if (h25.includes('UART') || h25.includes('TERMINAL')) {
        return 'uart';
    }
    if (h25.includes('SIGNAL') || h25.includes('GEN') || h25.includes('FUNC')) {
        return 'sig';
    }
    return '';
}
export function isInstrumentLibraryId(f25: string): boolean {
    return detectInstrumentKind(f25).length > 0;
}
export function instrumentSubTabForKind(e25: string): number {
    if (e25 === 'osc')
        return 0;
    if (e25 === 'logic')
        return 1;
    if (e25 === 'dmm')
        return 2;
    if (e25 === 'sig')
        return 3;
    if (e25 === 'uart')
        return 4;
    if (e25 === 'vm')
        return 5;
    if (e25 === 'am')
        return 6;
    if (e25 === 'power')
        return 7;
    if (e25 === 'freq')
        return 8;
    return -1;
}
export function instrumentSubTabForLibraryId(d25: string): number {
    return instrumentSubTabForKind(detectInstrumentKind(d25));
}
