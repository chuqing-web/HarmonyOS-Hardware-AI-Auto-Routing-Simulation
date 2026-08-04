/**
 * GitHub OAuth Device Flow 配置（Client ID 可公开；禁止打包 Client Secret）
 */
export class GitHubOAuthConfig {
    static readonly CLIENT_ID: string = 'Ov23livEwPIPxK8xN1pN';
    static readonly OWNER: string = 'chuqing-web';
    static readonly REPO: string = 'HarmonyOS-Hardware-AI-Auto-Routing-Simulation';
    static readonly FULL_NAME: string = `${GitHubOAuthConfig.OWNER}/${GitHubOAuthConfig.REPO}`;
    static readonly DEVICE_CODE_URL: string = 'https://github.com/login/device/code';
    static readonly TOKEN_URL: string = 'https://github.com/login/oauth/access_token';
    static readonly API_BASE: string = 'https://api.github.com';
    static readonly VERIFICATION_URI_FALLBACK: string = 'https://github.com/login/device';
    static readonly REPO_URL: string = `https://github.com/${GitHubOAuthConfig.OWNER}/${GitHubOAuthConfig.REPO}`;
    /** 读用户信息 + starred 列表（公开仓库足够） */
    static readonly SCOPE: string = 'read:user';
    static starCheckUrl(): string {
        return `${GitHubOAuthConfig.API_BASE}/user/starred/${GitHubOAuthConfig.OWNER}/${GitHubOAuthConfig.REPO}`;
    }
    static starredListUrl(page: number = 1, perPage: number = 100): string {
        return `${GitHubOAuthConfig.API_BASE}/user/starred?per_page=${perPage}&page=${page}`;
    }
    static userUrl(): string {
        return `${GitHubOAuthConfig.API_BASE}/user`;
    }
}
