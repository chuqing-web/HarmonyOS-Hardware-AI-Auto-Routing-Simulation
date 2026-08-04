/**
 * GitHub OAuth Device Flow — 申请设备码、轮询 access_token
 * Token 双写：Preferences（ApplicationContext）+ filesDir 备份文件
 */
import http from '@ohos.net.http';
import preferences from '@ohos.data.preferences';
import fs from '@ohos.file.fs';
import { Logger } from '../utils/Logger';
import { arrayBufferToString } from '../utils/MapHelpers';
import { GitHubOAuthConfig } from './GitHubOAuthConfig';

const TAG = 'GitHubDeviceAuth';
const PREFS_NAME = 'elecdraw_github_oauth';
const KEY_ACCESS_TOKEN = 'access_token';
const KEY_LOGIN = 'github_login';

export interface DeviceCodeSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  intervalSec: number;
}

export interface DeviceAuthResult {
  success: boolean;
  accessToken: string;
  error: string;
  kind: string;
}

interface TokenFilePayload {
  accessToken: string;
  login: string;
}

interface GitHubHttpGetResult {
  code: number;
  body: string;
  emptyBodyError: boolean;
}

export class GitHubDeviceAuth {
  private static prefs: preferences.Preferences | null = null;
  private static cancelPoll: boolean = false;
  private static tokenFilePath: string = '';
  private static memoryToken: string = '';
  private static memoryLogin: string = '';

  static async init(context: Context): Promise<void> {
    try {
      let storeCtx: Context = context;
      try {
        // 跨 Ability 稳定读写
        storeCtx = context.getApplicationContext();
      } catch (_e) { /* 使用原 context */ }
      GitHubDeviceAuth.prefs = await preferences.getPreferences(storeCtx, PREFS_NAME);
    } catch (e) {
      Logger.warn(TAG, `prefs init failed: ${e}`);
      GitHubDeviceAuth.prefs = null;
    }
    try {
      const filesDir = context.filesDir;
      const dir = `${filesDir}/AISchSim`;
      try {
        fs.accessSync(dir);
      } catch (_e) {
        try {
          fs.mkdirSync(dir);
        } catch (_e2) { /* ignore */ }
      }
      GitHubDeviceAuth.tokenFilePath = `${dir}/github_oauth.json`;
    } catch (e) {
      Logger.warn(TAG, `token file path failed: ${e}`);
      GitHubDeviceAuth.tokenFilePath = '';
    }
    // 启动时把磁盘/prefs 灌入内存，避免后续 prefs 句柄异常
    const loaded = await GitHubDeviceAuth.loadFromDisk();
    if (loaded.accessToken.length > 0) {
      GitHubDeviceAuth.memoryToken = loaded.accessToken;
      GitHubDeviceAuth.memoryLogin = loaded.login;
      Logger.info(TAG, `token restored len=${loaded.accessToken.length} login=${loaded.login}`);
    } else {
      Logger.info(TAG, 'no stored github token');
    }
  }

  static cancelPolling(): void {
    GitHubDeviceAuth.cancelPoll = true;
  }

  static async getStoredToken(): Promise<string> {
    if (GitHubDeviceAuth.memoryToken.length > 0) {
      return GitHubDeviceAuth.memoryToken;
    }
    const fromPrefs = await GitHubDeviceAuth.readPrefsToken();
    if (fromPrefs.length > 0) {
      GitHubDeviceAuth.memoryToken = fromPrefs;
      return fromPrefs;
    }
    const disk = await GitHubDeviceAuth.loadFromDisk();
    if (disk.accessToken.length > 0) {
      GitHubDeviceAuth.memoryToken = disk.accessToken;
      GitHubDeviceAuth.memoryLogin = disk.login;
      return disk.accessToken;
    }
    return '';
  }

  static async getStoredLogin(): Promise<string> {
    if (GitHubDeviceAuth.memoryLogin.length > 0) {
      return GitHubDeviceAuth.memoryLogin;
    }
    if (GitHubDeviceAuth.prefs) {
      try {
        const login = (await GitHubDeviceAuth.prefs.get(KEY_LOGIN, '')) as string;
        if (login.length > 0) {
          GitHubDeviceAuth.memoryLogin = login;
          return login;
        }
      } catch (_e) { /* ignore */ }
    }
    const disk = await GitHubDeviceAuth.loadFromDisk();
    if (disk.login.length > 0) {
      GitHubDeviceAuth.memoryLogin = disk.login;
      return disk.login;
    }
    return '';
  }

  static async saveToken(token: string, login: string = ''): Promise<void> {
    GitHubDeviceAuth.memoryToken = token;
    if (login.length > 0) {
      GitHubDeviceAuth.memoryLogin = login;
    }
    if (GitHubDeviceAuth.prefs) {
      try {
        await GitHubDeviceAuth.prefs.put(KEY_ACCESS_TOKEN, token);
        await GitHubDeviceAuth.prefs.put(KEY_LOGIN, GitHubDeviceAuth.memoryLogin);
        await GitHubDeviceAuth.prefs.flush();
      } catch (e) {
        Logger.warn(TAG, `prefs saveToken failed: ${e}`);
      }
    }
    await GitHubDeviceAuth.writeTokenFile(token, GitHubDeviceAuth.memoryLogin);
    Logger.info(TAG, `token saved len=${token.length} login=${GitHubDeviceAuth.memoryLogin}`);
  }

  static async clearToken(): Promise<void> {
    GitHubDeviceAuth.memoryToken = '';
    GitHubDeviceAuth.memoryLogin = '';
    if (GitHubDeviceAuth.prefs) {
      try {
        await GitHubDeviceAuth.prefs.delete(KEY_ACCESS_TOKEN);
        await GitHubDeviceAuth.prefs.delete(KEY_LOGIN);
        await GitHubDeviceAuth.prefs.flush();
      } catch (e) {
        Logger.warn(TAG, `prefs clearToken failed: ${e}`);
      }
    }
    if (GitHubDeviceAuth.tokenFilePath.length > 0) {
      try {
        fs.unlinkSync(GitHubDeviceAuth.tokenFilePath);
      } catch (_e) { /* ignore */ }
    }
  }

  static async requestDeviceCode(): Promise<DeviceCodeSession | null> {
    const body = `client_id=${encodeURIComponent(GitHubOAuthConfig.CLIENT_ID)}` +
      (GitHubOAuthConfig.SCOPE.length > 0
        ? `&scope=${encodeURIComponent(GitHubOAuthConfig.SCOPE)}`
        : '');
    const raw = await GitHubDeviceAuth.postForm(GitHubOAuthConfig.DEVICE_CODE_URL, body);
    if (raw === null) {
      return null;
    }
    try {
      const data = JSON.parse(raw) as Record<string, Object>;
      const deviceCode = `${data['device_code'] ?? ''}`;
      const userCode = `${data['user_code'] ?? ''}`;
      if (deviceCode.length === 0 || userCode.length === 0) {
        Logger.warn(TAG, `device code parse fail: ${raw}`);
        return null;
      }
      const verificationUri = `${data['verification_uri'] ?? GitHubOAuthConfig.VERIFICATION_URI_FALLBACK}`;
      const expiresIn = Number(data['expires_in'] ?? 900);
      let intervalSec = Number(data['interval'] ?? 5);
      if (intervalSec < 1) {
        intervalSec = 5;
      }
      return {
        deviceCode,
        userCode,
        verificationUri: verificationUri.length > 0
          ? verificationUri
          : GitHubOAuthConfig.VERIFICATION_URI_FALLBACK,
        expiresIn: expiresIn > 0 ? expiresIn : 900,
        intervalSec
      };
    } catch (e) {
      Logger.warn(TAG, `device code JSON error: ${e}`);
      return null;
    }
  }

  static async pollForToken(
    session: DeviceCodeSession,
    onPending?: (msg: string) => void
  ): Promise<DeviceAuthResult> {
    GitHubDeviceAuth.cancelPoll = false;
    const deadline = Date.now() + session.expiresIn * 1000;
    let intervalMs = session.intervalSec * 1000;
    const bodyBase =
      `client_id=${encodeURIComponent(GitHubOAuthConfig.CLIENT_ID)}` +
      `&device_code=${encodeURIComponent(session.deviceCode)}` +
      `&grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')}`;

    while (Date.now() < deadline) {
      if (GitHubDeviceAuth.cancelPoll) {
        return { success: false, accessToken: '', error: '已取消', kind: 'denied' };
      }
      await GitHubDeviceAuth.sleep(intervalMs);
      if (GitHubDeviceAuth.cancelPoll) {
        return { success: false, accessToken: '', error: '已取消', kind: 'denied' };
      }

      const raw = await GitHubDeviceAuth.postForm(GitHubOAuthConfig.TOKEN_URL, bodyBase);
      if (raw === null) {
        if (onPending) {
          onPending('网络异常，重试中…');
        }
        continue;
      }

      try {
        const data = JSON.parse(raw) as Record<string, Object>;
        const token = `${data['access_token'] ?? ''}`;
        if (token.length > 0) {
          return { success: true, accessToken: token, error: '', kind: 'ok' };
        }
        const err = `${data['error'] ?? ''}`;
        if (err === 'authorization_pending') {
          if (onPending) {
            onPending('等待浏览器授权…');
          }
          continue;
        }
        if (err === 'slow_down') {
          intervalMs += 5000;
          if (onPending) {
            onPending('请稍候…');
          }
          continue;
        }
        if (err === 'expired_token') {
          return { success: false, accessToken: '', error: '设备码已过期，请重试', kind: 'expired' };
        }
        if (err === 'access_denied') {
          return { success: false, accessToken: '', error: '用户拒绝授权', kind: 'denied' };
        }
        return {
          success: false,
          accessToken: '',
          error: `${data['error_description'] ?? err ?? '授权失败'}`,
          kind: 'other'
        };
      } catch (e) {
        Logger.warn(TAG, `token poll parse: ${e} raw=${raw}`);
      }
    }
    return { success: false, accessToken: '', error: '授权超时', kind: 'expired' };
  }

  static async fetchLogin(accessToken: string): Promise<string> {
    const raw = await GitHubDeviceAuth.githubGet(GitHubOAuthConfig.userUrl(), accessToken);
    if (raw === null || raw.code !== 200) {
      return '';
    }
    try {
      const data = JSON.parse(raw.body.length > 0 ? raw.body : '{}') as Record<string, Object>;
      return `${data['login'] ?? ''}`;
    } catch (_e) {
      return '';
    }
  }

  /** 统一 GitHub GET；兼容 204 空体（鸿蒙可能抛 2300052） */
  static async githubGet(
    url: string,
    accessToken: string
  ): Promise<GitHubHttpGetResult | null> {
    // 先试 Bearer，再试 token 前缀
    const auths: string[] = [
      `Bearer ${accessToken}`,
      `token ${accessToken}`
    ];
    for (let i = 0; i < auths.length; i++) {
      const result = await GitHubDeviceAuth.githubGetOnce(url, auths[i]);
      if (result === null) {
        continue;
      }
      if (result.code === 401 && i === 0) {
        continue;
      }
      return result;
    }
    return null;
  }

  private static async githubGetOnce(
    url: string,
    authorization: string
  ): Promise<GitHubHttpGetResult | null> {
    let client: http.HttpRequest | null = null;
    try {
      client = http.createHttp();
      const resp = await client.request(url, {
        method: http.RequestMethod.GET,
        connectTimeout: 12000,
        readTimeout: 15000,
        header: {
          'Accept': 'application/vnd.github+json',
          'Authorization': authorization,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AI-SCH-Simulator'
        }
      });
      const code = Number(resp.responseCode);
      const raw = resp.result === undefined || resp.result === null
        ? ''
        : (typeof resp.result === 'string' ? resp.result : `${resp.result}`);
      const ok: GitHubHttpGetResult = { code, body: raw, emptyBodyError: false };
      return ok;
    } catch (e) {
      const msg = `${e}`;
      // 鸿蒙对 204 No Content 常抛：服务器未返回数据 / 2300052
      if (GitHubDeviceAuth.isEmptyBodyError(msg)) {
        Logger.warn(TAG, `GET empty-body quirk url=${url} err=${msg}`);
        const empty: GitHubHttpGetResult = { code: 204, body: '', emptyBodyError: true };
        return empty;
      }
      Logger.warn(TAG, `GET failed url=${url} err=${msg}`);
      return null;
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e) { /* ignore */ }
      }
    }
  }

  static isEmptyBodyError(msg: string): boolean {
    const lower = msg.toLowerCase();
    return msg.indexOf('2300052') >= 0
      || lower.indexOf('returned nothing') >= 0
      || lower.indexOf('no content') >= 0
      || msg.indexOf('未返回') >= 0
      || msg.indexOf('没有返回') >= 0;
  }

  private static async readPrefsToken(): Promise<string> {
    if (!GitHubDeviceAuth.prefs) {
      return '';
    }
    try {
      return (await GitHubDeviceAuth.prefs.get(KEY_ACCESS_TOKEN, '')) as string;
    } catch (_e) {
      return '';
    }
  }

  private static async loadFromDisk(): Promise<TokenFilePayload> {
    const empty: TokenFilePayload = { accessToken: '', login: '' };
    if (GitHubDeviceAuth.tokenFilePath.length === 0) {
      return empty;
    }
    try {
      fs.accessSync(GitHubDeviceAuth.tokenFilePath);
      const fileHandle = fs.openSync(GitHubDeviceAuth.tokenFilePath, fs.OpenMode.READ_ONLY);
      const stat = fs.statSync(GitHubDeviceAuth.tokenFilePath);
      const buffer = new ArrayBuffer(stat.size);
      fs.readSync(fileHandle.fd, buffer);
      fs.closeSync(fileHandle);
      const text = arrayBufferToString(buffer);
      const data = JSON.parse(text) as TokenFilePayload;
      return {
        accessToken: data.accessToken ?? '',
        login: data.login ?? ''
      };
    } catch (_e) {
      return empty;
    }
  }

  private static async writeTokenFile(token: string, login: string): Promise<void> {
    if (GitHubDeviceAuth.tokenFilePath.length === 0) {
      return;
    }
    try {
      const payload: TokenFilePayload = { accessToken: token, login };
      const json = JSON.stringify(payload);
      const fileHandle = fs.openSync(
        GitHubDeviceAuth.tokenFilePath,
        fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC
      );
      fs.writeSync(fileHandle.fd, json);
      fs.closeSync(fileHandle);
    } catch (e) {
      Logger.warn(TAG, `writeTokenFile failed: ${e}`);
    }
  }

  private static async postForm(url: string, body: string): Promise<string | null> {
    let client: http.HttpRequest | null = null;
    try {
      client = http.createHttp();
      const resp = await client.request(url, {
        method: http.RequestMethod.POST,
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 12000,
        readTimeout: 15000,
        header: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'AI-SCH-Simulator'
        },
        extraData: body
      });
      const code = resp.responseCode;
      const raw = typeof resp.result === 'string' ? resp.result : `${resp.result}`;
      if (code < 200 || code >= 300) {
        Logger.warn(TAG, `POST ${url} HTTP ${code}: ${raw}`);
        if (raw.length > 0) {
          return raw;
        }
        return null;
      }
      return raw;
    } catch (e) {
      Logger.warn(TAG, `POST ${url} failed: ${e}`);
      return null;
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e) { /* ignore */ }
      }
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve: (v: void) => void) => {
      setTimeout((): void => {
        resolve();
      }, ms);
    });
  }
}
