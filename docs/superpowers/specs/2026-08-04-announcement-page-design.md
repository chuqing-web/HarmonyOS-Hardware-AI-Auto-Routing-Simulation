# AI-SCH Announcement Page & App Feed — Design Spec

**Date:** 2026-08-04  
**Status:** Approved for implementation planning  
**Product:** AI-SCH Simulator (`com.elecdraw.aischsim`)  
**Deploy target:** [chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web](https://github.com/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web.git)

## 1. Goal

Build a **zero-build static announcement / product site** under `Announcement_Page/` that:

1. Deploys to GitHub Pages as the public product homepage.
2. Exposes a stable JSON feed so the HarmonyOS app homepage can load **announcement image + text**.
3. Presents a **bilingual (EN default / 中文)** detailed product introduction.
4. Visual language references [智谱开放平台 bigmodel.cn](https://bigmodel.cn/) (AI product marketing site: light canvas, blue CTAs, card grids, generous whitespace) — without copying Zhipu brand assets.

Also update the app so About website and announcement endpoint point at this site.

## 2. Non-goals

- No CMS / admin UI / build toolchain (Vite, etc.).
- No server-side rendering or auth.
- App does **not** need full i18n for announcements in this iteration (maps Chinese fields into existing `title`/`body`).
- No Visual Companion / local mockup server.

## 3. Architecture

### 3.1 Dual endpoints

| Surface | Path | Consumer |
|---------|------|----------|
| Marketing site | `/` (`index.html`) | Browser |
| Announcement API | `/api/announcement.json` | App `HomeAnnouncementService` + site Announcement section |

### 3.2 Source layout (this monorepo)

```
Announcement_Page/
  index.html
  css/styles.css
  js/i18n.js
  js/main.js
  api/announcement.json
  assets/images/          # announcement art, hero/poster copies
  README.md               # Pages setup + how to update announcement
```

Development lives in `Announcement_Page/`. Deploy by publishing **that folder’s contents as the GitHub repo root** of the target empty repo (not nested under a subfolder on Pages).

### 3.3 Public URLs (GitHub Pages)

| Role | URL |
|------|-----|
| Site | `https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/` |
| API | `https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/api/announcement.json` |

Absolute HTTPS URLs are required for `imageUrl` / `linkUrl` so the HarmonyOS HTTP client can load assets.

## 4. Announcement JSON contract

### 4.1 Schema

```json
{
  "id": "string",
  "title_zh": "string",
  "title_en": "string",
  "body_zh": "string",
  "body_en": "string",
  "title": "string",
  "body": "string",
  "imageUrl": "https://…/assets/images/….jpg",
  "image_url": "https://…/assets/images/….jpg",
  "linkUrl": "https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/",
  "publishedAt": "YYYY-MM-DD"
}
```

### 4.2 Compatibility rules

- Flat `title` / `body` **mirror Chinese** (`title_zh` / `body_zh`) so an unmodified app that only reads legacy fields still works.
- Prefer absolute URLs for images and links.
- Empty `title`+`body` (after trim) must not be published; app falls back to local default when payload is empty/invalid.

### 4.3 App mapping (this iteration)

`HomeAnnouncementService`:

1. Set `endpoint` to the Pages API URL above.
2. Parse: prefer `title_zh` / `body_zh`, else `title` / `body` / `text`; prefer `imageUrl` || `image_url`; same for link/published fields as today.
3. Keep existing HTTP GET + fallback behavior.

`HomeAboutInfo.websiteLine`: replace `www.elecdraw.local` with the public Pages site host/path (display string consistent with Proteus-style About; prefer the github.io path without requiring a custom domain).

## 5. Site information architecture

Top → bottom:

1. **Nav** — Logo “AI-SCH”, in-page anchors (Features / Pipeline / Simulation / Labs), language toggle **EN | 中** (default **EN**).
2. **Hero** — Product name, one-line value prop, dual CTAs (Explore features / View announcement), visual (design poster or UI still from repo `picture/` when available).
3. **Announcement** — Fetch `api/announcement.json`; render image + title + body for active language (`_en` / `_zh`).
4. **Why** — Section patterned after Zhipu “不止…，构建…”: 3–4 capability cards (executable AI topology, mixed-signal sim, teaching loop, HarmonyOS-native).
5. **Capability grid** — Flagship family cards: AI pipeline, analog/digital/MCU sim, instruments, PCB, lab templates, multi-provider AI governance.
6. **Pipeline** — Clarify → Select → Layout → Net → WAR → QA step strip.
7. **Platform** — HarmonyOS NEXT, modular HAR, education / contest scenarios.
8. **Footer** — Copyright ElecDraw / AI-SCH, link to GitHub deploy repo, link to announcement API.

Copy is driven by `data-i18n` keys in `js/i18n.js`; toggling language switches the whole page. Announcement block re-resolves fields from the same JSON.

## 6. Visual design (bigmodel.cn-inspired)

| Token | Direction |
|-------|-----------|
| Background | Light gray-white; soft cool blue-gray mist on hero/footer |
| Primary | Tech blue ≈ `#1A66FF`–`#3B82F6` for CTAs, links, active nav |
| Text | Near-black headings, mid-gray body; high contrast |
| Components | Rounded cards, light shadow, hairline dividers; icon + title + short blurb + “View” |
| Motion | Staggered fade-up on scroll/load; sticky nav tighten on scroll; no neon / purple gradients |
| Type | Geometric sans for EN display (e.g. Outfit or Manrope via Google Fonts); Noto Sans SC / system for Chinese |

Reference: [https://bigmodel.cn/](https://bigmodel.cn/) layout rhythm (hero → product cards → family grid → footer), not their logos or trademarks.

## 7. Content sources

Product facts and feature lists come from `README.zh-CN.md` / `README.md` (AI-SCH 1.1.1, HarmonyOS NEXT, AI prompt pipeline, simulation, instruments, labs). Initial announcement copy: welcome / release note style in both languages pointing at the site.

Reuse existing marketing imagery from repo `picture/` (e.g. design poster) by copying optimized assets into `Announcement_Page/assets/images/` — do not hotlink private/local paths from the app bundle.

## 8. Deployment & ops

1. Enable GitHub Pages on the target repo: branch `main`, folder `/` (root).
2. Push `Announcement_Page/` **contents** to repo root (or sync via script documented in README).
3. Update announcement: edit `api/announcement.json` + replace image under `assets/images/`, commit, push; CDN/cache may take a short time to refresh.
4. After first successful Pages deploy, verify App endpoint and About URL match live URLs.

## 9. App change checklist

- [ ] `HomeAnnouncementService.endpoint` → live `announcement.json` URL
- [ ] Parse `title_zh` / `body_zh` (and en fields reserved for later)
- [ ] `HomeAboutInfo` default + collected `websiteLine` → Pages site URL
- [ ] Manual smoke: offline fallback still works when endpoint fails

## 10. Success criteria

- Opening the Pages URL shows a polished bilingual product site (default English).
- `GET …/api/announcement.json` returns valid JSON; site Announcement section and app home panel show the same Chinese text + image (app).
- About panel website line matches the public site.
- Updating JSON + image via git updates what the app fetches without an app store release (after cache expiry).

## 11. Out of scope follow-ups (explicit)

- App-side language preference for announcements.
- Custom domain.
- Announcement history list / multiple feed items.
- Automated sync CI from monorepo `Announcement_Page/` → deploy repo (optional later).
