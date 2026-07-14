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
    static parse(json: string, path: string): PluginInfo {
        const manifest = JSON.parse(json) as PluginManifest;
        const perms: PluginPermission[] = [];
        for (let i = 0; i < manifest.permissions.length; i++) {
            const p = PluginManifestParser.mapPerm(manifest.permissions[i]);
            if (p)
                perms.push(p);
        }
        const info: PluginInfo = {
            id: IdUtil.generate('plugin'),
            name: manifest.name,
            version: manifest.version,
            type: PluginType.SCRIPT,
            path: path,
            signed: path.includes('.signed'),
            enabled: true,
            permissions: perms.length > 0 ? perms : [PluginPermission.READ_SCHEMATIC]
        };
        return info;
    }
    private static mapPerm(name: string): PluginPermission | null {
        switch (name) {
            case 'read_schematic': return PluginPermission.READ_SCHEMATIC;
            case 'write_schematic': return PluginPermission.WRITE_SCHEMATIC;
            case 'read_sim_data': return PluginPermission.READ_SIM_DATA;
            case 'network': return PluginPermission.NETWORK;
            case 'read_keys': return PluginPermission.READ_KEYS;
            default: return null;
        }
    }
}
