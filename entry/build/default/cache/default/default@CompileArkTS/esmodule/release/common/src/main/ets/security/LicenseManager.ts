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
    getDefaultFeatures(e11: LicenseTier): LicenseFeatures {
        switch (e11) {
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
    loadFromPath(a11: string): LicenseStatus {
        this.licensePath = a11;
        this.tampered = false;
        try {
            fs.accessSync(a11);
            const c11 = LicenseManager.readText(a11);
            const d11 = JSON.parse(c11) as LicenseFile;
            return this.applyLicense(d11);
        }
        catch (b11) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '未找到授权文件，运行免费版');
        }
    }
    applyLicenseContent(x10: string): LicenseStatus {
        try {
            const z10 = JSON.parse(x10) as LicenseFile;
            return this.applyLicense(z10);
        }
        catch (y10) {
            return this.buildStatus(false, LicenseTier.FREE, `授权解析失败: ${y10}`);
        }
    }
    importAndSave(s10: string, t10: string): LicenseStatus {
        const u10 = this.applyLicenseContent(t10);
        if (u10.valid) {
            try {
                const w10 = fs.openSync(s10, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
                fs.writeSync(w10.fd, t10);
                fs.closeSync(w10);
                this.licensePath = s10;
            }
            catch (v10) {
                return this.buildStatus(false, LicenseTier.FREE, `授权保存失败: ${v10}`);
            }
        }
        return u10;
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
    async applyTrialStatus(q10: Context): Promise<void> {
        await TrialManager.init(q10);
        const r10 = await TrialManager.getStatus();
        this.trialActive = r10.active && !this.license;
        this.trialDaysRemaining = r10.daysRemaining;
        this.trialMessage = r10.active ? `试用期剩余 ${r10.daysRemaining} 天` : '试用期已结束';
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
    static buildSignedLicense(h10: LicenseTier, i10: string, j10: string, k10: number = 365): string {
        const l10 = new Date();
        const m10 = new Date(l10.getTime() + k10 * 86400000);
        const n10 = LicenseManager.getInstance();
        const o10: LicenseFile = {
            tier: h10,
            licensee: j10,
            deviceCode: i10.toUpperCase(),
            issuedAt: l10.toISOString(),
            expiresAt: m10.toISOString(),
            offlineDays: 365,
            features: n10.getDefaultFeatures(h10),
            signature: ''
        };
        const p10 = JSON.stringify({
            tier: o10.tier,
            deviceCode: o10.deviceCode,
            expiresAt: o10.expiresAt,
            licensee: o10.licensee
        });
        o10.signature = CryptoUtil.signLicensePayload(p10);
        return JSON.stringify(o10, null, 2);
    }
    private applyLicense(e10: LicenseFile): LicenseStatus {
        const f10 = LicenseManager.computeSignature(e10);
        if (e10.signature !== f10) {
            this.tampered = true;
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '授权签名校验失败，已降级免费版');
        }
        const g10 = HardwareFingerprint.getDeviceCode();
        if (e10.deviceCode.toUpperCase() !== g10) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '设备码不匹配');
        }
        this.license = e10;
        return this.validateCurrent();
    }
    private validateCurrent(): LicenseStatus {
        if (!this.license) {
            return this.buildStatus(false, LicenseTier.FREE, '免费版');
        }
        const b10 = new Date(this.license.expiresAt).getTime();
        const c10 = Date.now();
        const d10 = Math.max(0, Math.ceil((b10 - c10) / 86400000));
        if (c10 > b10) {
            this.license = null;
            return this.buildStatus(false, LicenseTier.FREE, '授权已过期，已降级免费版');
        }
        return this.buildStatus(true, this.license.tier, `授权有效，剩余 ${d10} 天`, d10);
    }
    private buildStatus(x9: boolean, y9: LicenseTier, z9: string, a10: number = 0): LicenseStatus {
        return {
            valid: x9,
            tier: x9 ? y9 : LicenseTier.FREE,
            deviceMatched: x9,
            expired: !x9 && z9.includes('过期'),
            daysRemaining: a10,
            message: z9
        };
    }
    private static computeSignature(v9: LicenseFile): string {
        const w9 = JSON.stringify({
            tier: v9.tier,
            deviceCode: v9.deviceCode,
            expiresAt: v9.expiresAt,
            licensee: v9.licensee
        });
        return CryptoUtil.signLicensePayload(w9);
    }
    private static readText(q9: string): string {
        try {
            const s9 = fs.openSync(q9, fs.OpenMode.READ_ONLY);
            const t9 = fs.statSync(q9);
            const u9 = new ArrayBuffer(t9.size);
            fs.readSync(s9.fd, u9);
            fs.closeSync(s9);
            return arrayBufferToString(u9);
        }
        catch (r9) {
            throw new Error(`Failed to read file: ${q9}`);
        }
    }
}
