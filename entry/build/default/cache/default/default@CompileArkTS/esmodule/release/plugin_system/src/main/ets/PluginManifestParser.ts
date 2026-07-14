import { PluginPermission, PluginType, IdUtil } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PluginInfo } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface PluginManifest {
    name: string;
    version: string;
    entry: string;
    apis: string[];
    permissions: string[];
    description?: string;
}
export class PluginManifestParser {
    static parse(e401: string, f401: string): PluginInfo {
        const g401 = JSON.parse(e401) as PluginManifest;
        const h401: PluginPermission[] = [];
        for (let j401 = 0; j401 < g401.permissions.length; j401++) {
            const k401 = PluginManifestParser.mapPerm(g401.permissions[j401]);
            if (k401)
                h401.push(k401);
        }
        const i401: PluginInfo = {
            id: IdUtil.generate('plugin'),
            name: g401.name,
            version: g401.version,
            type: PluginType.SCRIPT,
            path: f401,
            signed: f401.includes('.signed'),
            enabled: true,
            permissions: h401.length > 0 ? h401 : [PluginPermission.READ_SCHEMATIC]
        };
        return i401;
    }
    private static mapPerm(d401: string): PluginPermission | null {
        switch (d401) {
            case 'read_schematic': return PluginPermission.READ_SCHEMATIC;
            case 'write_schematic': return PluginPermission.WRITE_SCHEMATIC;
            case 'read_sim_data': return PluginPermission.READ_SIM_DATA;
            case 'network': return PluginPermission.NETWORK;
            case 'read_keys': return PluginPermission.READ_KEYS;
            default: return null;
        }
    }
}
