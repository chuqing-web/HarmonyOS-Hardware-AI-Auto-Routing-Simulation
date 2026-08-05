/**
 * 首页 News — 直连 GitHub Releases API
 * 失败不回退假列表；恰好 1 个 .hap 才可下载。
 */
import http from '@ohos.net.http';
import fs from '@ohos.file.fs';
import { Want, common } from '@kit.AbilityKit';
import { fileUri } from '@kit.CoreFileKit';
import { APP_VERSION_NAME, Logger } from 'common';
import { ProteusHomeNewsItem } from '../components/proteus/ProteusHomeWidgets';

const TAG = 'HomeRelease';

export interface GitHubReleaseAssetDto {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubReleaseDto {
  tag_name: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string;
  assets: GitHubReleaseAssetDto[];
}

export interface HomeReleaseFetchResult {
  ok: boolean;
  /** 网络/HTTP/解析失败 */
  networkError: boolean;
  /** 成功但无正式可用条目（过滤后为空） */
  empty: boolean;
  hasUpdate: boolean;
  items: ProteusHomeNewsItem[];
  statusMessage: string;
  /** 原始解析结果，供 Ignore beta 切换时重映射 */
  releases: GitHubReleaseDto[];
}

export interface HapDownloadResult {
  ok: boolean;
  localPath: string;
  message: string;
}

export class HomeReleaseService {
  static readonly RELEASES_URL: string =
    'https://api.github.com/repos/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation/releases?per_page=20';

  static sampleNewsItem(): ProteusHomeNewsItem {
    return {
      description: 'Sample tutorials (Test_Template)',
      releaseDate: '—',
      uscValid: '—',
      actionLabel: 'Open',
      highlightUpdate: false
    };
  }

  static async fetchReleases(): Promise<HomeReleaseFetchResult> {
    let client: http.HttpRequest | null = null;
    try {
      client = http.createHttp();
      const resp = await client.request(HomeReleaseService.RELEASES_URL, {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 10000,
        readTimeout: 15000,
        header: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AI-SCH-Simulator'
        }
      });
      const code = Number(resp.responseCode);
      if (code < 200 || code >= 300) {
        Logger.warn(TAG, `HTTP ${code}`);
        return HomeReleaseService.failNetwork('网络不稳定');
      }
      const raw = typeof resp.result === 'string' ? resp.result : `${resp.result}`;
      const releases = HomeReleaseService.parseReleasesJson(raw);
      if (releases === null) {
        return HomeReleaseService.failNetwork('网络不稳定');
      }
      return HomeReleaseService.buildResult(releases, true);
    } catch (e) {
      Logger.warn(TAG, `fetch failed: ${e}`);
      return HomeReleaseService.failNetwork('网络不稳定');
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e) { /* ignore */ }
      }
    }
  }

  /** 用已缓存 releases 按 ignoreBeta 重算列表 */
  static buildResult(releases: GitHubReleaseDto[], ignoreBeta: boolean): HomeReleaseFetchResult {
    const filtered: GitHubReleaseDto[] = [];
    for (let i = 0; i < releases.length; i++) {
      const r = releases[i];
      if (r.draft) {
        continue;
      }
      if (ignoreBeta && (r.prerelease || HomeReleaseService.looksBetaTag(r.tag_name))) {
        continue;
      }
      filtered.push(r);
    }
    if (filtered.length === 0) {
      const emptyOut: HomeReleaseFetchResult = {
        ok: true,
        networkError: false,
        empty: true,
        hasUpdate: false,
        items: [],
        statusMessage: '暂无 Release',
        releases: releases
      };
      return emptyOut;
    }

    const currentNorm = HomeReleaseService.normalizeVersion(APP_VERSION_NAME);
    let bestUpdateTag = '';
    let bestUpdateScore = -1;
    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];
      const hap = HomeReleaseService.pickSoleHap(r.assets);
      if (hap === null) {
        continue;
      }
      const score = HomeReleaseService.versionScore(HomeReleaseService.normalizeVersion(r.tag_name));
      const curScore = HomeReleaseService.versionScore(currentNorm);
      if (score > curScore && score > bestUpdateScore) {
        bestUpdateScore = score;
        bestUpdateTag = HomeReleaseService.normalizeVersion(r.tag_name);
      }
    }

    const items: ProteusHomeNewsItem[] = [];
    for (let i = 0; i < filtered.length; i++) {
      items.push(HomeReleaseService.toNewsItem(filtered[i], currentNorm, bestUpdateTag));
    }

    const out: HomeReleaseFetchResult = {
      ok: true,
      networkError: false,
      empty: false,
      hasUpdate: bestUpdateTag.length > 0,
      items: items,
      statusMessage: '',
      releases: releases
    };
    return out;
  }

  static async downloadHap(
    ctx: common.UIAbilityContext,
    downloadUrl: string,
    fileName: string
  ): Promise<HapDownloadResult> {
    const safeName = HomeReleaseService.sanitizeFileName(fileName);
    const dir = `${ctx.filesDir}/downloads`;
    const localPath = `${dir}/${safeName}`;
    let client: http.HttpRequest | null = null;
    try {
      try {
        fs.accessSync(dir);
      } catch (_e) {
        fs.mkdirSync(dir, true);
      }
      client = http.createHttp();
      const resp = await client.request(downloadUrl, {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        connectTimeout: 20000,
        readTimeout: 300000,
        header: {
          'Accept': 'application/octet-stream',
          'User-Agent': 'AI-SCH-Simulator'
        }
      });
      const code = Number(resp.responseCode);
      if (code < 200 || code >= 300) {
        return { ok: false, localPath: '', message: `下载失败 HTTP ${code}` };
      }
      const buf = resp.result as ArrayBuffer;
      if (!buf || buf.byteLength <= 0) {
        return { ok: false, localPath: '', message: '下载内容为空' };
      }
      try {
        fs.accessSync(localPath);
        fs.unlinkSync(localPath);
      } catch (_e) { /* not exists */ }
      const file = fs.openSync(localPath,
        fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      try {
        fs.writeSync(file.fd, buf);
      } finally {
        fs.closeSync(file);
      }
      return { ok: true, localPath: localPath, message: 'ok' };
    } catch (e) {
      Logger.warn(TAG, `download failed: ${e}`);
      return { ok: false, localPath: '', message: `下载失败: ${e}` };
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e) { /* ignore */ }
      }
    }
  }

  /**
   * 尝试调起系统安装器；失败时返回 false（调用方提示已保存路径）。
   * 普通应用可能无 INSTALL_BUNDLE 权限，故以 startAbility 尽力而为。
   */
  static async trySystemInstall(ctx: common.UIAbilityContext, localPath: string): Promise<boolean> {
    try {
      const wantInstall: Want = {
        action: 'ohos.want.action.INSTALL_BUNDLE',
        parameters: {
          'ohos.extra.param.key.bundleFilePath': localPath
        }
      };
      await ctx.startAbility(wantInstall);
      return true;
    } catch (e1) {
      Logger.warn(TAG, `INSTALL_BUNDLE want failed: ${e1}`);
    }
    try {
      const uri = fileUri.getUriFromPath(localPath);
      const wantView: Want = {
        action: 'ohos.want.action.viewData',
        uri: uri,
        type: 'application/hap'
      };
      await ctx.startAbility(wantView);
      return true;
    } catch (e2) {
      Logger.warn(TAG, `viewData hap failed: ${e2}`);
    }
    return false;
  }

  static normalizeVersion(raw: string): string {
    let s = (raw ?? '').trim();
    if (s.length === 0) {
      return '0.0.0';
    }
    if (s.charAt(0) === 'v' || s.charAt(0) === 'V') {
      s = s.substring(1);
    }
    const cut = s.indexOf('-');
    if (cut >= 0) {
      s = s.substring(0, cut);
    }
    const parts = s.split('.');
    const nums: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = i < parts.length ? parts[i].replace(/[^0-9]/g, '') : '0';
      nums.push(p.length > 0 ? p : '0');
    }
    return `${nums[0]}.${nums[1]}.${nums[2]}`;
  }

  /** 可比较整数：major*1e6 + minor*1e3 + patch */
  static versionScore(norm: string): number {
    const parts = norm.split('.');
    const maj = Number(parts[0] ?? '0');
    const min = Number(parts[1] ?? '0');
    const pat = Number(parts[2] ?? '0');
    return maj * 1000000 + min * 1000 + pat;
  }

  private static failNetwork(msg: string): HomeReleaseFetchResult {
    return {
      ok: false,
      networkError: true,
      empty: true,
      hasUpdate: false,
      items: [],
      statusMessage: msg,
      releases: []
    };
  }

  private static parseReleasesJson(raw: string): GitHubReleaseDto[] | null {
    try {
      const data: Object = JSON.parse(raw) as Object;
      if (!Array.isArray(data)) {
        return null;
      }
      const arr = data as Object[];
      const out: GitHubReleaseDto[] = [];
      for (let i = 0; i < arr.length; i++) {
        const row = arr[i] as Record<string, Object | string | boolean | number | Object[]>;
        const tag = `${row['tag_name'] ?? ''}`.trim();
        if (tag.length === 0) {
          continue;
        }
        const assetsRaw = row['assets'];
        const assets: GitHubReleaseAssetDto[] = [];
        if (Array.isArray(assetsRaw)) {
          for (let j = 0; j < assetsRaw.length; j++) {
            const a = assetsRaw[j] as Record<string, Object | string | number>;
            const name = `${a['name'] ?? ''}`.trim();
            const url = `${a['browser_download_url'] ?? ''}`.trim();
            if (name.length === 0 || url.length === 0) {
              continue;
            }
            assets.push({
              name: name,
              browser_download_url: url,
              size: Number(a['size'] ?? 0)
            });
          }
        }
        const draftVal = row['draft'];
        const preVal = row['prerelease'];
        out.push({
          tag_name: tag,
          name: `${row['name'] ?? tag}`.trim(),
          draft: draftVal === true,
          prerelease: preVal === true,
          published_at: `${row['published_at'] ?? ''}`.trim(),
          assets: assets
        });
      }
      return out;
    } catch (_e) {
      return null;
    }
  }

  private static looksBetaTag(tag: string): boolean {
    const t = tag.toLowerCase();
    return t.indexOf('beta') >= 0 || t.indexOf('alpha') >= 0 ||
      t.indexOf('-rc') >= 0 || t.indexOf('.rc') >= 0;
  }

  private static pickSoleHap(assets: GitHubReleaseAssetDto[]): GitHubReleaseAssetDto | null {
    const haps: GitHubReleaseAssetDto[] = [];
    for (let i = 0; i < assets.length; i++) {
      const n = assets[i].name.toLowerCase();
      if (n.endsWith('.hap')) {
        haps.push(assets[i]);
      }
    }
    if (haps.length === 1) {
      return haps[0];
    }
    return null;
  }

  private static toNewsItem(
    r: GitHubReleaseDto,
    currentNorm: string,
    bestUpdateTag: string
  ): ProteusHomeNewsItem {
    const tagNorm = HomeReleaseService.normalizeVersion(r.tag_name);
    const title = (r.name && r.name.length > 0) ? r.name : `AI-SCH ${r.tag_name}`;
    const description = `${title} [${r.tag_name}]`;
    const hap = HomeReleaseService.pickSoleHap(r.assets);
    const dateStr = HomeReleaseService.formatDate(r.published_at);

    if (tagNorm === currentNorm) {
      return {
        description: description,
        releaseDate: dateStr,
        uscValid: 'Yes',
        actionLabel: 'In Use',
        tagName: r.tag_name,
        highlightUpdate: false
      };
    }
    if (hap === null) {
      return {
        description: description,
        releaseDate: dateStr,
        uscValid: 'No',
        actionLabel: 'Unavailable',
        tagName: r.tag_name,
        highlightUpdate: false
      };
    }
    const isUpdate = tagNorm === bestUpdateTag && bestUpdateTag.length > 0;
    return {
      description: description,
      releaseDate: dateStr,
      uscValid: 'Yes',
      actionLabel: isUpdate ? 'Update' : 'Download',
      downloadUrl: hap.browser_download_url,
      hapFileName: hap.name,
      tagName: r.tag_name,
      highlightUpdate: isUpdate
    };
  }

  private static formatDate(iso: string): string {
    if (!iso || iso.length < 10) {
      return '—';
    }
    // 2026-08-05T02:25:25Z → 05/08/2026
    const y = iso.substring(0, 4);
    const m = iso.substring(5, 7);
    const d = iso.substring(8, 10);
    return `${d}/${m}/${y}`;
  }

  private static sanitizeFileName(name: string): string {
    const base = name.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (base.length === 0) {
      return `update_${Date.now()}.hap`;
    }
    if (!base.toLowerCase().endsWith('.hap')) {
      return `${base}.hap`;
    }
    return base;
  }
}
