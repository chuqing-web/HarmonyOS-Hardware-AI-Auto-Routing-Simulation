/**
 * BOM 元器件离线价格数据库 + 国产替代映射
 */
export interface PriceEntry {
    libDevId: string;
    unitPrice: number;
    currency: string;
    qtyBreaks: Map<number, number>;
}
export interface BomCostEstimate {
    original: number;
    optimized: number;
    savings: number;
}
const DOMESTIC_REPLACEMENTS: Map<string, string> = new Map([
    ['STM32F103C8', 'GD32F103C8'],
    ['STM32F103C8T6', 'GD32F103C8T6'],
    ['AT89C51', 'STC89C52RC'],
    ['AT89C52', 'STC89C52RC'],
    ['CH340G', 'CH340C'],
    ['CH340T', 'CH340C'],
    ['LM358', 'SGM358'],
    ['LM555', 'NE555'],
    ['1N4148', '1N4148WS'],
]);
const BASE_PRICES: Map<string, number> = new Map([
    ['R_10k', 0.001],
    ['C_100nF', 0.002],
    ['LED_RED', 0.01],
    ['74HC04', 0.05],
    ['74HC08', 0.05],
    ['STM32F103C8', 3.5],
    ['STM32F103C8T6', 3.5],
    ['AT89C51', 1.2],
    ['LM358', 0.15],
    ['LM555', 0.12],
    ['1N4148', 0.01],
    ['XTAL_11M', 0.08],
    ['CH340G', 0.6],
]);
export class BomPricingDatabase {
    static getUnitPrice(libDevId: string, qty: number = 1): number {
        const base = BASE_PRICES.get(libDevId) ?? BASE_PRICES.get(libDevId.toUpperCase()) ?? 0.05;
        if (qty >= 1000)
            return base * 0.7;
        if (qty >= 100)
            return base * 0.85;
        if (qty >= 10)
            return base * 0.95;
        return base;
    }
    static getDomesticReplacement(libDevId: string): string | null {
        return DOMESTIC_REPLACEMENTS.get(libDevId) ?? null;
    }
    static estimateBomCost(libIds: string[]): BomCostEstimate {
        let original = 0;
        let optimized = 0;
        for (let i = 0; i < libIds.length; i++) {
            const id = libIds[i];
            original += BomPricingDatabase.getUnitPrice(id);
            const replacement = BomPricingDatabase.getDomesticReplacement(id);
            optimized += BomPricingDatabase.getUnitPrice(replacement ?? id);
        }
        return { original: original, optimized: optimized, savings: original - optimized };
    }
}
