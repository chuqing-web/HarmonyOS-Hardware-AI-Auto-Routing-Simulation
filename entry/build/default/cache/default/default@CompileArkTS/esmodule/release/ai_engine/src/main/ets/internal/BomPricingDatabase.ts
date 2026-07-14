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
    ['1N4148', 0.01],
    ['XTAL_11M', 0.08],
    ['CH340G', 0.6],
]);
export class BomPricingDatabase {
    static getUnitPrice(l313: string, m313: number = 1): number {
        const n313 = BASE_PRICES.get(l313) ?? BASE_PRICES.get(l313.toUpperCase()) ?? 0.05;
        if (m313 >= 1000)
            return n313 * 0.7;
        if (m313 >= 100)
            return n313 * 0.85;
        if (m313 >= 10)
            return n313 * 0.95;
        return n313;
    }
    static getDomesticReplacement(k313: string): string | null {
        return DOMESTIC_REPLACEMENTS.get(k313) ?? null;
    }
    static estimateBomCost(e313: string[]): BomCostEstimate {
        let f313 = 0;
        let g313 = 0;
        for (let h313 = 0; h313 < e313.length; h313++) {
            const i313 = e313[h313];
            f313 += BomPricingDatabase.getUnitPrice(i313);
            const j313 = BomPricingDatabase.getDomesticReplacement(i313);
            g313 += BomPricingDatabase.getUnitPrice(j313 ?? i313);
        }
        return { original: f313, optimized: g313, savings: f313 - g313 };
    }
}
