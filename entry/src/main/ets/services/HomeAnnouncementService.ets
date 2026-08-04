/**
 * 首页公告栏 — 预留从服务器拉取图片与文字的接口。
 * 服务端未就绪或请求失败时回退到本地默认公告。
 */
import http from '@ohos.net.http';
import { Logger } from 'common';

/** 单条公告（服务端 JSON 字段约定） */
export interface HomeAnnouncement {
  id: string;
  title: string;
  body: string;
  /** 公告配图 URL；空字符串表示无图 */
  imageUrl: string;
  /** 可选跳转链接 */
  linkUrl: string;
  /** 发布时间展示文案 */
  publishedAt: string;
}

/**
 * 服务端响应形状（可按实际 API 调整字段映射）。
 * GET {endpoint} → JSON
 */
interface AnnouncementApiPayload {
  id?: string;
  title?: string;
  body?: string;
  text?: string;
  title_zh?: string;
  title_en?: string;
  body_zh?: string;
  body_en?: string;
  imageUrl?: string;
  image_url?: string;
  linkUrl?: string;
  link_url?: string;
  publishedAt?: string;
  published_at?: string;
  updatedAt?: string;
}

export class HomeAnnouncementService {
  /**
   * 公告接口地址（GitHub Pages 静态 JSON）。
   * 期望 GET 返回 JSON：双语 title_zh/en、body_zh/en，以及兼容字段 title/body、imageUrl…
   * 本迭代优先映射中文到 HomeAnnouncement.title/body。
   */
  static endpoint: string =
    'https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/api/announcement.json';

  static defaultAnnouncement(): HomeAnnouncement {
    return {
      id: 'local-default',
      title: '',
      body: '',
      imageUrl: '',
      linkUrl: '',
      publishedAt: ''
    };
  }

  /**
   * 拉取最新公告。endpoint 为空或请求失败时返回默认公告。
   */
  static async fetchLatest(): Promise<HomeAnnouncement> {
    const url = HomeAnnouncementService.endpoint.trim();
    if (url.length === 0) {
      return HomeAnnouncementService.defaultAnnouncement();
    }
    let client: http.HttpRequest | null = null;
    try {
      client = http.createHttp();
      const resp = await client.request(url, {
        method: http.RequestMethod.GET,
        expectDataType: http.HttpDataType.STRING,
        connectTimeout: 8000,
        readTimeout: 10000,
        header: {
          'Accept': 'application/json'
        }
      });
      const code = resp.responseCode;
      if (code < 200 || code >= 300) {
        Logger.warn('HomeAnnouncement', `HTTP ${code}, fallback to default`);
        return HomeAnnouncementService.defaultAnnouncement();
      }
      const raw = typeof resp.result === 'string' ? resp.result : `${resp.result}`;
      return HomeAnnouncementService.parsePayload(raw);
    } catch (e) {
      Logger.warn('HomeAnnouncement', `fetch failed: ${e}, fallback to default`);
      return HomeAnnouncementService.defaultAnnouncement();
    } finally {
      if (client !== null) {
        try {
          client.destroy();
        } catch (_e) {
          /* ignore */
        }
      }
    }
  }

  /** 供测试或手动注入解析 */
  static parsePayload(rawJson: string): HomeAnnouncement {
    const fallback = HomeAnnouncementService.defaultAnnouncement();
    try {
      const data = JSON.parse(rawJson) as AnnouncementApiPayload;
      // App 暂用中文；保留 en 字段供后续系统语言映射
      const title = (data.title_zh ?? data.title ?? '').trim();
      const body = (data.body_zh ?? data.body ?? data.text ?? '').trim();
      if (title.length === 0 && body.length === 0) {
        return fallback;
      }
      const imageUrl = (data.imageUrl ?? data.image_url ?? '').trim();
      const linkUrl = (data.linkUrl ?? data.link_url ?? '').trim();
      const publishedAt = (data.publishedAt ?? data.published_at ?? data.updatedAt ?? '').trim();
      const id = (data.id ?? '').trim();
      return {
        id: id.length > 0 ? id : `remote-${Date.now()}`,
        title: title.length > 0 ? title : 'Announcement',
        body: body,
        imageUrl: imageUrl,
        linkUrl: linkUrl,
        publishedAt: publishedAt
      };
    } catch (_e) {
      return fallback;
    }
  }
}
