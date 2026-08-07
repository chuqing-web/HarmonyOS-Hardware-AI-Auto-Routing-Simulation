# AI-SCH Announcement & Product Site

静态双语官网 + 公告 JSON，供 **AI-SCH 仿真器** 首页拉取图片与文字。

**线上地址（需已开启 GitHub Pages）：**

- 官网：https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/
- 公告 API：https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/api/announcement.json

部署仓库：[chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web](https://github.com/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web)

本地源目录（本工程内）：`C:\Projects\ElecDraw_Harmony\Announcement_Page\`

---

## 如何更新公告图片和文字并上传

App 首页 **Announcement** 面板只读部署仓库上的 `api/announcement.json`，**不会**自动读取你电脑上的 `Announcement_Page`。  
因此流程是：**改本地 → 推到 GitHub 部署仓库 → 等 Pages 生效**。

### 第 1 步：准备图片（可选）

1. 把新公告图放到本地：

   `Announcement_Page/assets/images/`

   例如：`Announcement.png`（文件名大小写要固定，建议与 JSON 里完全一致）。

2. 注意：GitHub Pages 在 Linux 上**区分大小写**。  
   JSON 里写 `Announcement.png`，仓库里也必须是 `Announcement.png`，不能写成 `announcement.png`。

### 第 2 步：改公告文字与图片地址

编辑本地文件：

`Announcement_Page/api/announcement.json`

示例：

```json
{
  "id": "2026-08-04-v1.1.0-release",
  "title_zh": "【软件正式发布】AI-SCH 仿真器 v1.1.0",
  "title_en": "[Official Release] AI-SCH Simulator v1.1.0",
  "body_zh": "这里写中文正文……",
  "body_en": "English body here…",
  "title": "【软件正式发布】AI-SCH 仿真器 v1.1.0",
  "body": "这里写中文正文……",
  "imageUrl": "https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/assets/images/Announcement.png",
  "image_url": "https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/assets/images/Announcement.png",
  "linkUrl": "https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/",
  "link_url": "https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/",
  "publishedAt": "2026-08-04"
}
```

| 字段 | 说明 |
|------|------|
| `title_zh` / `body_zh` | **App 实际显示的中文**标题 / 正文 |
| `title_en` / `body_en` | 官网语言切换用英文 |
| `title` / `body` | 与中文保持一致（兼容旧解析） |
| `imageUrl` / `image_url` | 必须是 **完整 HTTPS** 地址（见上），不要写本地盘符路径 |
| `linkUrl` | 点击跳转（官网或 `#pcb` 等） |
| `publishedAt` | 日期展示 |
| `id` | 建议每次更新换新 id，便于排查 |

**不要**把 `imageUrl` 写成 `C:\Projects\...`。App 只能从公网 HTTPS 拉图。

### 第 3 步：本地预览（可选）

```powershell
cd C:\Projects\ElecDraw_Harmony\Announcement_Page
python -m http.server 8080
```

浏览器打开 http://localhost:8080 ，确认页面与公告区块正常。

### 第 4 步：上传到 GitHub（发布）

把 **`Announcement_Page` 目录下的内容** 覆盖推到部署仓库**根目录**（不要多一层 `Announcement_Page/`）。

PowerShell：

```powershell
$src = "C:\Projects\ElecDraw_Harmony\Announcement_Page"
$tmp = "$env:TEMP\aisch-announcement-deploy"
$repo = "https://github.com/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web.git"

if (-not (Test-Path "$tmp\.git")) {
  git clone $repo $tmp
} else {
  Set-Location $tmp
  git pull origin main
}

Copy-Item -Path "$src\*" -Destination $tmp -Recurse -Force
Set-Location $tmp
git add -A
git status
git commit -m "Update announcement image and text"
git push origin main
```

推送成功后等待约 **1～2 分钟**，再检查：

1. API：打开 [announcement.json](https://chuqing-web.github.io/HarmonyOS-Hardware-AI-Auto-Routing-Simulation-Web/api/announcement.json)，确认文字与 `imageUrl` 已变。  
2. 图片：浏览器直接打开 JSON 里的 `imageUrl`，应能看到新图。  
3. App：有网时重新进入首页 Announcement；若仍是旧内容，稍等或强刷 / 重启应用（可能有缓存）。

### 第 5 步：确认 GitHub Pages 已开启（仅首次）

部署仓库 → **Settings** → **Pages** → Source：**Deploy from a branch** → Branch **`main`** / folder **`/ (root)`** → Save。

---

## App 会显示什么

| 项 | 来源 |
|----|------|
| 标题 | `title_zh`（没有则用 `title`） |
| 正文 | `body_zh`（没有则用 `body`） |
| 图片 | `imageUrl` 指向的 HTTPS 图；失败则用 App 内本地预留图 |
| 英文 `*_en` | 当前 App **不显示**（给官网切换语言用） |

改公告 **不必重新打包发版** App；只要推送 JSON/图片并等 Pages 生效即可。

---

## 常用资源文件

| 文件 | 用途 |
|------|------|
| `api/announcement.json` | App + 官网公告数据 |
| `assets/images/Announcement.png` | 当前公告配图（示例） |
| `assets/images/pcb-2d.png` / `pcb-3d.png` | 官网 PCB 画廊 |
| `assets/images/app-icon.png` / `favicon.png` | 与 App 一致的图标 |
| `index.html` / `css/` / `js/` | 产品介绍页 |

---

## App integration (English)

HarmonyOS app reads `api/announcement.json` via `HomeAnnouncementService.endpoint` and prefers Chinese fields (`title_zh` / `body_zh`). About → website opens this Pages URL in the system browser.
