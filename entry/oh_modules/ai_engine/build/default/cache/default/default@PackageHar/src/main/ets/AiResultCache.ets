/**
 * AI 结果缓存复用 — 指纹含器件坐标/网名，避免仅计数碰撞
 */
import { SchTopology, RouteResult, DiagError } from 'common';

export class AiResultCache {
  private routeCache: Map<string, RouteResult> = new Map();
  private diagCache: Map<string, DiagError[]> = new Map();
  private static readonly MAX_ENTRIES = 32;

  private hashTopo(topo: SchTopology, kind: string): string {
    const parts: string[] = [kind, topo.schUuid ?? '', String(topo.deviceList.length),
      String(topo.netList.length), String(topo.wireList.length)];
    const nDev = Math.min(topo.deviceList.length, 24);
    for (let i = 0; i < nDev; i++) {
      const d = topo.deviceList[i];
      parts.push(`${d.instUuid}:${d.libDevId}:${Math.round(d.x)}:${Math.round(d.y)}:${d.rotate}`);
    }
    const nNet = Math.min(topo.netList.length, 24);
    for (let i = 0; i < nNet; i++) {
      const n = topo.netList[i];
      parts.push(`${n.netUuid}:${(n.netName ?? '').toUpperCase()}:${n.nodeList.length}`);
    }
    let wireLen = 0;
    for (let i = 0; i < topo.wireList.length; i++) {
      wireLen += topo.wireList[i].points.length;
    }
    parts.push(`wl:${wireLen}`);
    return parts.join('|');
  }

  private trimMap<T>(map: Map<string, T>): void {
    if (map.size <= AiResultCache.MAX_ENTRIES) {
      return;
    }
    const keys = Array.from(map.keys());
    const drop = map.size - AiResultCache.MAX_ENTRIES;
    for (let i = 0; i < drop; i++) {
      map.delete(keys[i]);
    }
  }

  getCachedRoute(topo: SchTopology): RouteResult | null {
    return this.routeCache.get(this.hashTopo(topo, 'route')) ?? null;
  }

  cacheRoute(topo: SchTopology, route: RouteResult): void {
    this.routeCache.set(this.hashTopo(topo, 'route'), route);
    this.trimMap(this.routeCache);
  }

  getCachedDiag(topo: SchTopology): DiagError[] | null {
    return this.diagCache.get(this.hashTopo(topo, 'diag')) ?? null;
  }

  cacheDiag(topo: SchTopology, errors: DiagError[]): void {
    this.diagCache.set(this.hashTopo(topo, 'diag'), errors);
    this.trimMap(this.diagCache);
  }

  clear(): void {
    this.routeCache.clear();
    this.diagCache.clear();
  }
}
