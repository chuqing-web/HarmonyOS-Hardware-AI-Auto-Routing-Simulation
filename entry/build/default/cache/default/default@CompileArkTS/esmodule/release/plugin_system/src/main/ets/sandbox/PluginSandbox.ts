import { PluginPermission, ResultHelper, ErrCode, Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, WaveData, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface SandboxScriptResult {
    output: string;
    durationMs: number;
    timedOut: boolean;
}
export class PluginSandbox {
    private static readonly TIMEOUT_MS = 5000;
    static execute(l401: string, m401: Set<PluginPermission>, n401: SchTopology | null, o401: WaveData[]): ApiResult<SandboxScriptResult> {
        const p401 = Date.now();
        if (l401.length === 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'empty script');
        }
        if (l401.includes('fs.') || l401.includes('file://')) {
            if (!m401.has(PluginPermission.READ_SCHEMATIC)) {
                return ResultHelper.fail(ErrCode.ERR_PERMISSION, 'sandbox: fs access denied');
            }
        }
        if (l401.includes('network') || l401.includes('http')) {
            if (!m401.has(PluginPermission.NETWORK)) {
                return ResultHelper.fail(ErrCode.ERR_PERMISSION, 'sandbox: network denied');
            }
        }
        let q401 = '';
        if (l401.includes('readTopology') && n401) {
            q401 += `devices=${n401.deviceList.length};`;
        }
        if (l401.includes('readWaveData')) {
            q401 += `waves=${o401.length};`;
        }
        if (l401.includes('exportBom')) {
            q401 += 'bom=exported;';
        }
        if (q401.length === 0) {
            q401 = `executed:${l401.substring(0, 32)}`;
        }
        const r401 = Date.now() - p401;
        if (r401 > PluginSandbox.TIMEOUT_MS) {
            const t401: SandboxScriptResult = { output: 'timeout', durationMs: r401, timedOut: true };
            return ResultHelper.ok(t401);
        }
        Logger.info('plugin_sandbox', `script ok ${r401}ms`);
        const s401: SandboxScriptResult = { output: q401, durationMs: r401, timedOut: false };
        return ResultHelper.ok(s401);
    }
}
