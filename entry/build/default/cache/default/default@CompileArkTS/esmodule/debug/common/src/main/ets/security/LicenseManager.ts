import fs from "@ohos:file.fs";
import { arrayBufferToString } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/MapHelpers";
import { CryptoUtil } from "@bundle:com.elecdraw.aischsim/entry@common/ets/utils/CryptoUtil";
import { HardwareFingerprint } from "@bundle:com.elecdraw.aischsim/entry@common/ets/security/HardwareFingerprint";
import { TrialManager } from "@bundle:com.elecdraw.aischsim/entry@common/ets/security/TrialManager";
import { LicenseTier } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/LicenseTypes";
import type { LicenseFile, LicenseFeatures, LicenseStatus } from "@bundle:com.elecdraw.aischsim/entry@common/ets/types/LicenseTypes";
export class LicenseManager {
    private static instance: LicenseManager;
    private license: LicenseFile | null = null;
    private licensePath: string = '';
    private tampered: boolean = false;
    /** 本会话 Star 复验通过（不持久化为离线 Pro） */
    private starUnlockActive: boolean = false;
    private starGithubLogin: string = '';
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
                    maxAiApis: 8,
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
    setStarUnlock(active: boolean, githubLogin: string = ''): void {
        this.starUnlockActive = active;
        this.starGithubLogin = githubLogin;
    }
    isStarUnlocked(): boolean {
        return this.starUnlockActive;
    }
    getStarGithubLogin(): string {
        return this.starGithubLogin;
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
            return this.buildEffectiveStatus();
        }
    }
    applyLicenseContent(json: string): LicenseStatus {
        try {
            const lic = JSON.parse(json) as LicenseFile;
            return this.applyLicense(lic);
        }
        catch (e) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, `授权解析失败: ${e}`);
        }
    }
    importAndSave(path: string, json: string): LicenseStatus {
        const status = this.applyLicenseContent(json);
        if (status.valid && this.license !== null) {
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
        return this.buildEffectiveStatus();
    }
    getStatus(): LicenseStatus {
        return this.buildEffectiveStatus();
    }
    async applyTrialStatus(context: Context): Promise<void> {
        await TrialManager.init(context);
    }
    getTier(): LicenseTier {
        const fileStatus = this.validateLicenseOnly();
        if (fileStatus !== null && fileStatus.valid) {
            return fileStatus.tier;
        }
        if (this.starUnlockActive) {
            return LicenseTier.PERSONAL_PRO;
        }
        return LicenseTier.FREE;
    }
    getFeatures(): LicenseFeatures {
        return this.getDefaultFeatures(this.getTier());
    }
    isTampered(): boolean {
        return this.tampered;
    }
    getDeviceCode(): string {
        return HardwareFingerprint.getDeviceCode();
    }
    getLicenseeName(): string {
        if (this.license !== null && this.license.licensee.length > 0) {
            return this.license.licensee;
        }
        if (this.starGithubLogin.length > 0) {
            return `@${this.starGithubLogin}`;
        }
        return '';
    }
    getLicenseExpiryLabel(): string {
        if (this.license !== null && this.license.expiresAt.length > 0) {
            return LicenseManager.formatDisplayDate(this.license.expiresAt);
        }
        if (this.starUnlockActive) {
            return 'GitHub Star';
        }
        return '—';
    }
    isEvaluationMode(): boolean {
        return this.getTier() === LicenseTier.FREE;
    }
    private buildEffectiveStatus(): LicenseStatus {
        const fileStatus = this.validateLicenseOnly();
        if (fileStatus !== null && fileStatus.valid) {
            return fileStatus;
        }
        if (this.starUnlockActive) {
            return this.buildStatus(true, LicenseTier.PERSONAL_PRO, this.starGithubLogin.length > 0
                ? `专业版（GitHub Star · @${this.starGithubLogin}）`
                : '专业版（GitHub Star）', Number.MAX_SAFE_INTEGER);
        }
        return this.buildStatus(false, LicenseTier.FREE, '免费版 · Star 仓库可解锁专业版');
    }
    /** 仅校验 license 文件；无效返回 null 或 invalid status */
    private validateLicenseOnly(): LicenseStatus | null {
        if (!this.license) {
            return null;
        }
        const expires = new Date(this.license.expiresAt).getTime();
        const now = Date.now();
        const daysRemaining = Math.max(0, Math.ceil((expires - now) / 86400000));
        if (now > expires) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '授权已过期');
        }
        return this.buildStatus(true, this.license.tier, `授权有效，剩余 ${daysRemaining} 天`, daysRemaining);
    }
    private static formatDisplayDate(iso: string): string {
        const d = new Date(iso);
        if (isNaN(d.getTime())) {
            return iso;
        }
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    }
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
            return this.buildEffectiveStatus();
        }
        const localCode = HardwareFingerprint.getDeviceCode();
        if (lic.deviceCode.toUpperCase() !== localCode) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '设备码不匹配');
        }
        this.license = lic;
        return this.buildEffectiveStatus();
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
