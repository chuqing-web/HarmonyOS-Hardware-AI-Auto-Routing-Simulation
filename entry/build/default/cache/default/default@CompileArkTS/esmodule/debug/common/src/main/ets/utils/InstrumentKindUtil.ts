/**
 * 仪器器件类型识别 — 根据 libraryId 判断仪器种类及 Instr 面板子标签索引。
 * 子标签顺序: 示波0 逻辑1 万用2 信号3 串口4 电压5 电流6 功率7 频率8
 */
export function detectInstrumentKind(libraryId: string): string {
    if (libraryId.length === 0) {
        return '';
    }
    const id = libraryId.toUpperCase();
    if (id === 'OSCILLOSCOPE' || id.includes('OSCILLOSCOPE') ||
        (id.includes('SCOPE') && !id.includes('MICROSCOPE'))) {
        return 'osc';
    }
    if (id.includes('LOGIC_ANALYZER') || id === 'LA' || id.startsWith('LA_')) {
        return 'logic';
    }
    if (id.includes('VIRTUAL_METER') || id === 'MULTIMETER') {
        return 'dmm';
    }
    if (id.includes('VOLTMETER')) {
        return 'vm';
    }
    if (id.includes('AMMETER') || id === 'AMP_METER') {
        return 'am';
    }
    if (id === 'POWER_METER' || id.includes('POWER_METER') || id.includes('WATTMETER')) {
        return 'power';
    }
    if (id.includes('FREQ_COUNTER') || id === 'FREQ_COUNTER') {
        return 'freq';
    }
    if (id.includes('UART_TERMINAL') || id === 'UART_TERMINAL') {
        return 'uart';
    }
    // 禁止裸 GEN：会误伤 GENERIC_* 等
    if (id === 'SIGNAL_GEN' || id.startsWith('SIGNAL_GEN') || id.includes('FUNC_GEN')) {
        return 'sig';
    }
    return '';
}
export function isInstrumentLibraryId(libraryId: string): boolean {
    return detectInstrumentKind(libraryId).length > 0;
}
/** Map instrument kind → InstrumentPanel subTab index (-1 if unknown) */
export function instrumentSubTabForKind(kind: string): number {
    if (kind === 'osc')
        return 0;
    if (kind === 'logic')
        return 1;
    if (kind === 'dmm')
        return 2;
    if (kind === 'sig')
        return 3;
    if (kind === 'uart')
        return 4;
    if (kind === 'vm')
        return 5;
    if (kind === 'am')
        return 6;
    if (kind === 'power')
        return 7;
    if (kind === 'freq')
        return 8;
    return -1;
}
export function instrumentSubTabForLibraryId(libraryId: string): number {
    return instrumentSubTabForKind(detectInstrumentKind(libraryId));
}
