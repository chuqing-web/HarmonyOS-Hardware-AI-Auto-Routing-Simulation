/**
 * Proteus/PCAD/EAGLE 器件别名加载器
 */
import fs from '@ohos.file.fs';

export class ProteusAliasLoader {
  private aliases: Map<string, string> = new Map();
  private vendorMaps: Map<string, Map<string, string>> = new Map();

  loadFromJson(jsonText: string): number {
    this.aliases.clear();
    this.vendorMaps.clear();
    try {
      const parsed: Record<string, Object> = JSON.parse(jsonText) as Record<string, Object>;
      const aliasObj: Record<string, Object> = parsed['aliases'] as Record<string, Object>;
      if (aliasObj) {
        const keys: string[] = Object.keys(aliasObj);
        for (let i = 0; i < keys.length; i++) {
          this.aliases.set(keys[i].toUpperCase(), aliasObj[keys[i]] as string);
        }
      }
      const vendorObj: Record<string, Object> = parsed['vendorMappings'] as Record<string, Object>;
      if (vendorObj) {
        const vendors = Object.keys(vendorObj);
        for (let v = 0; v < vendors.length; v++) {
          const vendor = vendors[v];
          const map = new Map<string, string>();
          const entries: Record<string, Object> = vendorObj[vendor] as Record<string, Object>;
          const entryKeys = Object.keys(entries);
          for (let k = 0; k < entryKeys.length; k++) {
            map.set(entryKeys[k].toUpperCase(), entries[entryKeys[k]] as string);
          }
          this.vendorMaps.set(vendor, map);
        }
      }
      return this.aliases.size;
    } catch (_e) {
      return 0;
    }
  }

  resolve(name: string, vendor: string = ''): string {
    const upper = name.toUpperCase();
    const alias = this.aliases.get(upper);
    if (alias) return alias;
    if (vendor.length > 0) {
      const vMap = this.vendorMaps.get(vendor);
      if (vMap) {
        const keys = Array.from(vMap.keys());
        for (let i = 0; i < keys.length; i++) {
          if (upper.startsWith(keys[i])) {
            return vMap.get(keys[i]) ?? name;
          }
        }
      }
    }
    return name;
  }

  getAliasCount(): number { return this.aliases.size; }
}
