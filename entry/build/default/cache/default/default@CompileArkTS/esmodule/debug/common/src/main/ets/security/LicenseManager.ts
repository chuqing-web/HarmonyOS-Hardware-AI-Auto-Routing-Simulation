import fs from "@ohos:file.fs";
import { arrayBufferToString } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/CryptoUtil";
import { HardwareFingerprint } from "@bundle:com.elecdraw.aischsim/entry@common/ets/security/HardwareFingerprint";
import { TrialManager } from "@bundle:com.elecdraw.aischsim/entry@common/ets/security/TrialManager";
import { LicenseTier } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/LicenseTypes";
import type { LicenseFile, LicenseFeatures, LicenseStatus } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/LicenseTypes";
const LICENSE_SALT = 'AISchSim_License_v1';
export class LicenseManager {
    private static instance: LicenseManager;
    private license: LicenseFile | null = null;
    private licensePath: string = '';
    private tampered: boolean = false;
    private trialActive: boolean = false;
    private trialDaysRemaining: number = 0;
    private trialMessage: string = '';
    static getInstance(): LicenseManager {
        if (!LicenseManager.instance) {
            LicenseManager.instance = new LicenseManager();
        }
        return LicenseManager.instance;
    }
    getDefaultFeatures(tier: LicenseTier): LicenseFeatures {
        switch (tier) {
            case LicenseTier.PERSONAL_PRO:
            case LicenseTier.EDUCATION:
                return {
                    maxDevices: Number.MAX_SAFE_INTEGER,
                    dailyAiCalls: Number.MAX_SAFE_INTEGER,
                    maxAiApis: Number.MAX_SAFE_INTEGER,
                    stm32AdvancedPeriph: true,
                    monteCarlo: true,
                    faultInjection: true,
                    pluginSystem: true,
                    projectEncryption: true,
                    multiMonitorLayout: true,
                    teamAnnotation: true,
                    versionCompare: true,
                    batchBomExport: true
                };
            case LicenseTier.ENTERPRISE:
                return {
                    maxDevices: Number.MAX_SAFE_INTEGER,
                    dailyAiCalls: Number.MAX_SAFE_INTEGER,
                    maxAiApis: Number.MAX_SAFE_INTEGER,
                    stm32AdvancedPeriph: true,
                    monteCarlo: true,
                    faultInjection: true,
                    pluginSystem: true,
                    projectEncryption: true,
                    multiMonitorLayout: true,
                    teamAnnotation: true,
                    versionCompare: true,
                    batchBomExport: true
                };
            default:
                return {
                    maxDevices: 200,
                    dailyAiCalls: 50,
                    maxAiApis: 1,
                    stm32AdvancedPeriph: false,
                    monteCarlo: false,
                    faultInjection: false,
                    pluginSystem: false,
                    projectEncryption: false,
                    multiMonitorLayout: false,
                    teamAnnotation: false,
                    versionCompare: false,
                    batchBomExport: false
                };
        }
    }
    loadFromPath(path: string): LicenseStatus {
        this.licensePath = path;
        this.tampered = false;
        try {
            fs.accessSync(path);
            const json = LicenseManager.readText(path);
            const lic = JSON.parse(json) as LicenseFile;
            return this.applyLicense(lic);
        }
        catch (_e) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '未找到授权文件，运行免费版');
        }
    }
    applyLicenseContent(json: string): LicenseStatus {
        try {
            const lic = JSON.parse(json) as LicenseFile;
            return this.applyLicense(lic);
        }
        catch (e) {
            return this.buildStatus(false, LicenseTier.FREE, `授权解析失败: ${e}`);
        }
    }
    importAndSave(path: string, json: string): LicenseStatus {
        const status = this.applyLicenseContent(json);
        if (status.valid) {
            try {
                const fileHandle = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(fileHandle.fd, json);
                fs.closeSync(fileHandle);
                this.licensePath = path;
            }
            catch (e) {
                return this.buildStatus(false, LicenseTier.FREE, `授权保存失败: ${e}`);
            }
        }
        return status;
    }
    getStatus(): LicenseStatus {
        if (!this.license) {
            if (this.trialActive) {
                return this.buildStatus(true, LicenseTier.PERSONAL_PRO, this.trialMessage || `试用期剩余 ${this.trialDaysRemaining} 天`, this.trialDaysRemaining);
            }
            return this.buildStatus(false, LicenseTier.FREE, '免费版');
        }
        return this.validateCurrent();
    }
    async applyTrialStatus(context: Context): Promise<void> {
        await TrialManager.init(context);
        const trial = await TrialManager.getStatus();
        this.trialActive = trial.active && !this.license;
        this.trialDaysRemaining = trial.daysRemaining;
        this.trialMessage = trial.active ? `试用期剩余 ${trial.daysRemaining} 天` : '试用期已结束';
    }
    getTier(): LicenseTier {
        if (this.trialActive && !this.license)
            return LicenseTier.PERSONAL_PRO;
        return this.license?.tier ?? LicenseTier.FREE;
    }
    getFeatures(): LicenseFeatures {
        if (this.trialActive && !this.license) {
            return this.getDefaultFeatures(LicenseTier.PERSONAL_PRO);
        }
        if (!this.license || !this.validateCurrent().valid) {
            return this.getDefaultFeatures(LicenseTier.FREE);
        }
        return this.license.features;
    }
    isTampered(): boolean {
        return this.tampered;
    }
    getDeviceCode(): string {
        return HardwareFingerprint.getDeviceCode();
    }
    /** 开发/测试：根据设备码生成签名授权 JSON */
    static buildSignedLicense(tier: LicenseTier, deviceCode: string, licensee: string, daysValid: number = 365): string {
        const now = new Date();
        const expires = new Date(now.getTime() + daysValid * 86400000);
        const mgr = LicenseManager.getInstance();
        const payload: LicenseFile = {
            tier,
            licensee,
            deviceCode: deviceCode.toUpperCase(),
            issuedAt: now.toISOString(),
            expiresAt: expires.toISOString(),
            offlineDays: 365,
            features: mgr.getDefaultFeatures(tier),
            signature: ''
        };
        const signBody = JSON.stringify({
            tier: payload.tier,
            deviceCode: payload.deviceCode,
            expiresAt: payload.expiresAt,
            licensee: payload.licensee
        });
        payload.signature = CryptoUtil.signLicensePayload(signBody);
        return JSON.stringify(payload, null, 2);
    }
    private applyLicense(lic: LicenseFile): LicenseStatus {
        const expectedSig = LicenseManager.computeSignature(lic);
        if (lic.signature !== expectedSig) {
            this.tampered = true;
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '授权签名校验失败，已降级免费版');
        }
        const localCode = HardwareFingerprint.getDeviceCode();
        if (lic.deviceCode.toUpperCase() !== localCode) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '设备码不匹配');
        }
        this.license = lic;
        return this.validateCurrent();
    }
    private validateCurrent(): LicenseStatus {
        if (!this.license) {
            return this.buildStatus(false, LicenseTier.FREE, '免费版');
        }
        const expires = new Date(this.license.expiresAt).getTime();
        const now = Date.now();
        const daysRemaining = Math.max(0, Math.ceil((expires - now) / 86400000));
        if (now > expires) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '授权已过期，已降级免费版');
        }
        return this.buildStatus(true, this.license.tier, `授权有效，剩余 ${daysRemaining} 天`, daysRemaining);
    }
    private buildStatus(valid: boolean, tier: LicenseTier, message: string, daysRemaining: number = 0): LicenseStatus {
        return {
            valid,
            tier: valid ? tier : LicenseTier.FREE,
            deviceMatched: valid,
            expired: !valid && message.includes('过期'),
            daysRemaining,
            message
        };
    }
    private static computeSignature(lic: LicenseFile): string {
        const signBody = JSON.stringify({
            tier: lic.tier,
            deviceCode: lic.deviceCode,
            expiresAt: lic.expiresAt,
            licensee: lic.licensee
        });
        return CryptoUtil.signLicensePayload(signBody);
    }
    private static readText(path: string): string {
        try {
            const fileHandle = fs.openSync(path, fs.OpenMode.READ_ONLY);
            const stat = fs.statSync(path);
            const buffer = new ArrayBuffer(stat.size);
            fs.readSync(fileHandle.fd, buffer);
            fs.closeSync(fileHandle);
            return arrayBufferToString(buffer);
        }
        catch (e) {
            throw new Error(`Failed to read file: ${path}`);
        }
    }
}
