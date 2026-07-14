import { PluginPermission, ResultHelper, ErrCode, Logger } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { SchTopology, WaveData, ApiResult } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
export interface SandboxScriptResult {
    output: string;
    durationMs: number;
    timedOut: boolean;
}
export class PluginSandbox {
    private static readonly TIMEOUT_MS = 5000;
    static execute(scriptBody: string, grantedPerms: Set<PluginPermission>, topology: SchTopology | null, waves: WaveData[]): ApiResult<SandboxScriptResult> {
        const start = Date.now();
        if (scriptBody.length === 0) {
            return ResultHelper.fail(ErrCode.ERR_PARAM_INVALID, 'empty script');
        }
        if (scriptBody.includes('fs.') || scriptBody.includes('file://')) {
            if (!grantedPerms.has(PluginPermission.READ_SCHEMATIC)) {
                return ResultHelper.fail(ErrCode.ERR_PERMISSION, 'sandbox: fs access denied');
            }
        }
        if (scriptBody.includes('network') || scriptBody.includes('http')) {
            if (!grantedPerms.has(PluginPermission.NETWORK)) {
                return ResultHelper.fail(ErrCode.ERR_PERMISSION, 'sandbox: network denied');
            }
        }
        let output = '';
        if (scriptBody.includes('readTopology') && topology) {
            output += `devices=${topology.deviceList.length};`;
        }
        if (scriptBody.includes('readWaveData')) {
            output += `waves=${waves.length};`;
        }
        if (scriptBody.includes('exportBom')) {
            output += 'bom=exported;';
        }
        if (output.length === 0) {
            output = `executed:${scriptBody.substring(0, 32)}`;
        }
        const durationMs = Date.now() - start;
        if (durationMs > PluginSandbox.TIMEOUT_MS) {
            const timeoutResult: SandboxScriptResult = { output: 'timeout', durationMs, timedOut: true };
            return ResultHelper.ok(timeoutResult);
        }
        Logger.info('plugin_sandbox', `script ok ${durationMs}ms`);
        const okResult: SandboxScriptResult = { output, durationMs, timedOut: false };
        return ResultHelper.ok(okResult);
    }
}
