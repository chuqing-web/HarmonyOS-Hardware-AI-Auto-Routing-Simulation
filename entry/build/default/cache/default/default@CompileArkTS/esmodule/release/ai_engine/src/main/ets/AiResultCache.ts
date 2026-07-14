import type { SchTopology, RouteResult, DiagError } from 'common';
export class AiResultCache {
    private routeCache: Map<string, RouteResult> = new Map();
    private diagCache: Map<string, DiagError[]> = new Map();
    private hashTopo(w265: SchTopology): string {
        return `${w265.deviceList.length}_${w265.netList.length}_${w265.wireList.length}`;
    }
    getCachedRoute(v265: SchTopology): RouteResult | null {
        return this.routeCache.get(this.hashTopo(v265)) ?? null;
    }
    cacheRoute(t265: SchTopology, u265: RouteResult): void {
        this.routeCache.set(this.hashTopo(t265), u265);
    }
    getCachedDiag(s265: SchTopology): DiagError[] | null {
        return this.diagCache.get(this.hashTopo(s265)) ?? null;
    }
    cacheDiag(q265: SchTopology, r265: DiagError[]): void {
        this.diagCache.set(this.hashTopo(q265), r265);
    }
    clear(): void {
        this.routeCache.clear();
        this.diagCache.clear();
    }
}
