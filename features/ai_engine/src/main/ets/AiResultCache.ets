/**
 * AI 结果缓存复用
 */
import { SchTopology, RouteResult, DiagError } from 'common';

export class AiResultCache {
  private routeCache: Map<string, RouteResult> = new Map();
  private diagCache: Map<string, DiagError[]> = new Map();

  private hashTopo(topo: SchTopology): string {
    return `${topo.deviceList.length}_${topo.netList.length}_${topo.wireList.length}`;
  }

  getCachedRoute(topo: SchTopology): RouteResult | null {
    return this.routeCache.get(this.hashTopo(topo)) ?? null;
  }

  cacheRoute(topo: SchTopology, route: RouteResult): void {
    this.routeCache.set(this.hashTopo(topo), route);
  }

  getCachedDiag(topo: SchTopology): DiagError[] | null {
    return this.diagCache.get(this.hashTopo(topo)) ?? null;
  }

  cacheDiag(topo: SchTopology, errors: DiagError[]): void {
    this.diagCache.set(this.hashTopo(topo), errors);
  }

  clear(): void {
    this.routeCache.clear();
    this.diagCache.clear();
  }
}
