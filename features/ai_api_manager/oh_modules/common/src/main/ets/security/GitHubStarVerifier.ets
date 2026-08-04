/**
 * GitHub Star 复验 — 启动静默检测；兼容鸿蒙对 204 空体的异常
 */
import { Logger } from '../utils/Logger';
import { GitHubOAuthConfig } from './GitHubOAuthConfig';
import { GitHubDeviceAuth } from './GitHubDeviceAuth';
import { LicenseManager } from './LicenseManager';
import { FeatureGate } from './FeatureGate';

const TAG = 'GitHubStarVerifier';

export enum StarCheckKind {
  STARRED = 'starred',
  NOT_STARRED = 'not_starred',
  UNAUTHORIZED = 'unauthorized',
  NETWORK = 'network',
  NO_TOKEN = 'no_token'
}

export interface StarCheckResult {
  kind: StarCheckKind;
  message: string;
  login: string;
}

export class GitHubStarVerifier {
  /**
   * 启动复验：有 token 则查 Star；无网/失败 → 不升 Pro（保留 token，除非 401）。
   */
  static async revalidateOnStartup(context: Context): Promise<StarCheckResult> {
    await GitHubDeviceAuth.init(context);
    const token = await GitHubDeviceAuth.getStoredToken();
    if (token.length === 0) {
      LicenseManager.getInstance().setStarUnlock(false, '');
      FeatureGate.refresh();
      Logger.info(TAG, 'startup: no token');
      return { kind: StarCheckKind.NO_TOKEN, message: '未绑定 GitHub', login: '' };
    }
    Logger.info(TAG, `startup: token present len=${token.length}`);
    const result = await GitHubStarVerifier.checkStarred(token);
    await GitHubStarVerifier.applyResult(result, token);
    Logger.info(TAG, `startup result: ${result.kind} ${result.message}`);
    return result;
  }

  static async recheckNow(context: Context): Promise<StarCheckResult> {
    await GitHubDeviceAuth.init(context);
    const token = await GitHubDeviceAuth.getStoredToken();
    if (token.length === 0) {
      LicenseManager.getInstance().setStarUnlock(false, '');
      FeatureGate.refresh();
      return { kind: StarCheckKind.NO_TOKEN, message: '请先完成 GitHub 授权', login: '' };
    }
    const result = await GitHubStarVerifier.checkStarred(token);
    await GitHubStarVerifier.applyResult(result, token);
    return result;
  }

  static async activateWithToken(context: Context, accessToken: string): Promise<StarCheckResult> {
    await GitHubDeviceAuth.init(context);
    const login = await GitHubDeviceAuth.fetchLogin(accessToken);
    await GitHubDeviceAuth.saveToken(accessToken, login);
    const result = await GitHubStarVerifier.checkStarred(accessToken);
    if (result.login.length === 0 && login.length > 0) {
      result.login = login;
    }
    await GitHubStarVerifier.applyResult(result, accessToken);
    return result;
  }

  /**
   * 1) GET /user/starred/{owner}/{repo} → 204/404
   * 2) 若鸿蒙把 204 当异常，或结果不明 → 回退 GET /user/starred 列表匹配
   */
  static async checkStarred(accessToken: string): Promise<StarCheckResult> {
    const login = await GitHubDeviceAuth.getStoredLogin();
    const direct = await GitHubDeviceAuth.githubGet(GitHubOAuthConfig.starCheckUrl(), accessToken);

    if (direct !== null) {
      Logger.info(TAG, `starCheck HTTP ${direct.code} emptyQuirk=${direct.emptyBodyError}`);
      if (direct.code === 204 || direct.emptyBodyError) {
        return {
          kind: StarCheckKind.STARRED,
          message: '已 Star，专业版已激活',
          login
        };
      }
      if (direct.code === 404) {
        return {
          kind: StarCheckKind.NOT_STARRED,
          message: '尚未 Star 仓库，请先 Star 后再检测',
          login
        };
      }
      if (direct.code === 401 || direct.code === 403) {
        // 再试列表接口确认是否真的未授权
        const viaList = await GitHubStarVerifier.checkStarredViaList(accessToken, login);
        if (viaList.kind !== StarCheckKind.UNAUTHORIZED && viaList.kind !== StarCheckKind.NETWORK) {
          return viaList;
        }
        return {
          kind: StarCheckKind.UNAUTHORIZED,
          message: 'GitHub 授权失效，请重新授权',
          login: ''
        };
      }
      // 其它码：回退列表
      Logger.warn(TAG, `starCheck unexpected ${direct.code}, fallback list`);
    } else {
      Logger.warn(TAG, 'starCheck request null, fallback list');
    }

    return await GitHubStarVerifier.checkStarredViaList(accessToken, login);
  }

  /** 通过 starred 列表匹配目标仓库（返回 200+JSON，避免 204） */
  private static async checkStarredViaList(
    accessToken: string,
    login: string
  ): Promise<StarCheckResult> {
    const target = GitHubOAuthConfig.FULL_NAME.toLowerCase();
    for (let page = 1; page <= 5; page++) {
      const resp = await GitHubDeviceAuth.githubGet(
        GitHubOAuthConfig.starredListUrl(page, 100),
        accessToken
      );
      if (resp === null) {
        return {
          kind: StarCheckKind.NETWORK,
          message: '无网络或请求失败，按免费版运行',
          login
        };
      }
      if (resp.code === 401 || resp.code === 403) {
        return {
          kind: StarCheckKind.UNAUTHORIZED,
          message: 'GitHub 授权失效，请重新授权',
          login: ''
        };
      }
      if (resp.code !== 200) {
        Logger.warn(TAG, `starred list HTTP ${resp.code}`);
        return {
          kind: StarCheckKind.NETWORK,
          message: `检测失败 (HTTP ${resp.code})，按免费版运行`,
          login
        };
      }
      try {
        const arr = JSON.parse(resp.body.length > 0 ? resp.body : '[]') as Object[];
        if (!Array.isArray(arr) || arr.length === 0) {
          // 空页：未找到
          break;
        }
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i] as Record<string, Object>;
          const full = `${item['full_name'] ?? ''}`.toLowerCase();
          if (full === target) {
            return {
              kind: StarCheckKind.STARRED,
              message: '已 Star，专业版已激活',
              login
            };
          }
        }
        if (arr.length < 100) {
          break;
        }
      } catch (e) {
        Logger.warn(TAG, `starred list parse: ${e}`);
        return {
          kind: StarCheckKind.NETWORK,
          message: 'Star 列表解析失败，按免费版运行',
          login
        };
      }
    }
    return {
      kind: StarCheckKind.NOT_STARRED,
      message: '尚未 Star 仓库，请先 Star 后再检测',
      login
    };
  }

  private static async applyResult(result: StarCheckResult, token: string): Promise<void> {
    const mgr = LicenseManager.getInstance();
    if (result.kind === StarCheckKind.STARRED) {
      let login = result.login;
      if (login.length === 0) {
        login = await GitHubDeviceAuth.fetchLogin(token);
        if (login.length > 0) {
          await GitHubDeviceAuth.saveToken(token, login);
          result.login = login;
        }
      }
      mgr.setStarUnlock(true, login);
    } else if (result.kind === StarCheckKind.UNAUTHORIZED) {
      await GitHubDeviceAuth.clearToken();
      mgr.setStarUnlock(false, '');
    } else {
      // NOT_STARRED / NETWORK / NO_TOKEN — 不升 Pro；NETWORK 保留 token 供下次重试
      mgr.setStarUnlock(false, result.login);
    }
    FeatureGate.refresh();
  }
}
