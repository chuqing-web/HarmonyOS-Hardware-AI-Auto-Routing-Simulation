# GitHub Star OAuth Device Flow Unlock — Design Spec

**Date:** 2026-08-04  
**Status:** Approved — implemented 2026-08-04  
**Product:** AI-SCH Simulator (`com.elecdraw.aischsim`)  
**Repo to star:** [chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation](https://github.com/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation)  
**OAuth App:** AI-SCH · Client ID `Ov23livEwPIPxK8xN1pN`（公有，可进客户端；**禁止**打包 Client Secret）

## 1. Goal

恢复 **免费版 / 专业版** 能力分级，并通过 **GitHub OAuth Device Flow** 验证当前用户是否已 Star 目标仓库：

- 授权成功且 `GET /user/starred/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation` 返回 **204** → 本会话 **专业版**
- **每次启动联网复验**；失败、未 Star、token 失效 → **免费版**
- **无网 → 免费版**（不沿用上次专业态）

## 2. Non-goals

- 不使用传统 redirect / URL Scheme OAuth（鸿蒙桌面回调成本高）
- 不依赖「拉取全量 Stargazers 名单」比对（GitHub 2026 对 stargazers 列表收紧）
- 不把 Client Secret 写入 App 或仓库
- 本期不强制改造 `license.lic` 付费链路；若文件存在且有效，与 Star 解锁取 **更高档位**（见 §5.3）
- 不做 GitHub Marketplace 上架

## 3. Decisions (locked)

| 项 | 选择 |
|----|------|
| 授权方式 | A. 纯 Device Flow |
| 复验策略 | 每次启动联网复验 |
| 无网 | 强制免费版 |
| Client ID | `Ov23livEwPIPxK8xN1pN` |
| 目标仓库 | `chuqing-web` / `HarmonyOS-Hardware-AI-Auto-Routing-Simulation` |
| 解锁档位 | `LicenseTier.PERSONAL_PRO`（全专业能力矩阵） |

**前置运维：** OAuth App 设置页必须勾选 **Enable Device Flow**。

## 4. Architecture

```
启动 / About「解锁」
        │
        ▼
GitHubDeviceAuth  ──POST──► github.com/login/device/code
        │                      （client_id → user_code / device_code）
        │ UI 展示 user_code，打开 login/device
        │
        │ 轮询 POST login/oauth/access_token
        ▼
  持久化 access_token（Preferences）
        │
        ▼
GitHubStarVerifier ──GET──► api.github.com/user/starred/{owner}/{repo}
        │                     204 = starred / 404 = not / 401 = bad token
        ▼
LicenseManager.applyStarUnlock(bool) → FeatureGate 生效
```

### 4.1 模块职责

| 模块 | 位置（建议） | 职责 |
|------|--------------|------|
| `GitHubOAuthConfig` | `common/.../security/` | client_id、owner、repo、API 常量 |
| `GitHubDeviceAuth` | `common/.../security/` | Device Flow：申请码、轮询 token、存取 token |
| `GitHubStarVerifier` | `common/.../security/` | 带 token 查 Star；统一结果枚举 |
| `LicenseManager` | 已有 | 恢复 FREE / PRO 矩阵；接入 Star 会话态 |
| `FeatureGate` | 已有 | 恢复限权校验（非一律放行） |
| About UI | `entry/.../HomePage` + dialog | 展示设备码、打开浏览器、状态文案 |

HTTP 使用 `@ohos.net.http`（与 `HomeAnnouncementService` 一致）。

## 5. License / Feature behavior

### 5.1 免费版矩阵（恢复）

与改「全功能开放」之前一致，例如：

- `maxDevices: 200`
- `dailyAiCalls: 50`
- `maxAiApis: 8`
- 蒙特卡洛 / 故障注入 / 插件 / 工程加密 / STM32 高级外设 / 团队批注 / 版本对比 / 批量 BOM → `false`

### 5.2 专业版矩阵

`PERSONAL_PRO` / `EDUCATION` / `ENTERPRISE` 默认能力：无上限 + 上述高级开关全开。

### 5.3 有效档位优先级（会话内）

1. 有效 `license.lic` → 使用文件档位  
2. 否则，本会话 Star 复验通过 → `PERSONAL_PRO`  
3. 否则 → `FREE`  

试用期（`TrialManager`）本期可保持废弃或仅作历史 API；**不以试用绕过「无网免费」策略**。

### 5.4 启动时序（`AppService`）

1. `loadFromPath(license.lic)`（可选展示/正式授权）  
2. `await GitHubStarVerifier.revalidateOnStartup(context)`  
   - 无 token → Star 未解锁  
   - 无网 / 请求失败 → Star 未解锁（免费，除非有正式 license）  
   - 204 → 设置会话 `starUnlockActive = true`  
   - 404 → 清除「已解锁」会话态；可保留 token 供用户再次引导 Star  
   - 401 → 删 token + 免费  
3. `FeatureGate.refresh()`  
4. 再灌 AI API 金库（避免 FREE `maxAiApis` 截断；有 PRO 后再灌更稳，或 restore 跳过门禁保持现状）

## 6. Device Flow 细节

### 6.1 申请设备码

`POST https://github.com/login/device/code`  
Body（form）：`client_id`、`scope`（建议 `public_repo` 不需要；查自己的 starred 用默认即可，或显式空 scope / `read:user` 视 GitHub 要求——实现时以官方 Device Flow 文档为准，**最小 scope**）。

响应字段：`device_code`、`user_code`、`verification_uri`、`expires_in`、`interval`。

### 6.2 用户步骤（UI）

1. 复制/展示 `user_code`  
2. 用系统浏览器打开 `verification_uri`（通常 `https://github.com/login/device`）  
3. App 按 `interval` 轮询，直至成功 / 过期 / 用户取消  

### 6.3 轮询 token

`POST https://github.com/login/oauth/access_token`  
Accept: `application/json`  
处理：`authorization_pending`、`slow_down`、`expired_token`、`access_denied`、成功拿到 `access_token`。

### 6.4 Star 检查

`GET https://api.github.com/user/starred/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation`  
Headers：`Authorization: Bearer <token>`、`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`

| HTTP | 含义 |
|------|------|
| 204 | 已 Star → 专业版 |
| 404 | 未 Star → 免费版 + 提示去 Star 仓库 |
| 401 | token 无效 → 清 token，引导重新授权 |

## 7. Persistence

| 数据 | 存储 | 说明 |
|------|------|------|
| `access_token` | Preferences（如 `elecdraw_github_oauth`） | 私有；启动复验用 |
| `github_login`（可选） | 同上 | About 展示「已绑定 @user」 |
| 专业版会话标志 | 内存（`LicenseManager`） | **不**持久化为「离线仍专业」 |

无网启动：不读「上次已解锁」缓存升 PRO。

## 8. UI（About）

- 行文案示例：`License: Free` / `License: Pro (GitHub Star)` / 正式授权文案  
- 按钮：**「GitHub Star 解锁专业版」**  
  - 未绑定：启动 Device Flow 对话框（码 + 打开浏览器 + 取消）  
  - 已绑定未 Star：深链打开仓库 Star 页 + 「我已 Star，重新检测」  
- 启动复验结果用现有状态栏 / Toast 轻提示即可  

网址：仓库 `https://github.com/chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation`

## 9. Config constants

```ts
// GitHubOAuthConfig（示意）
CLIENT_ID = 'Ov23livEwPIPxK8xN1pN'
OWNER = 'chuqing-web'
REPO = 'HarmonyOS-Hardware-AI-Auto-Routing-Simulation'
DEVICE_CODE_URL = 'https://github.com/login/device/code'
TOKEN_URL = 'https://github.com/login/oauth/access_token'
STAR_CHECK_PATH = `/user/starred/${OWNER}/${REPO}`
```

## 10. Docs / README

- 说明：免费版限制、Star 解锁步骤、需联网、无网=免费  
- 运维：创建 OAuth App、Enable Device Flow、仅配置 client_id  
- 回滚：将 `LicenseManager`/`FeatureGate` 改回全开放即可去掉该商业化路径（不在本期）

## 11. Test plan

- [ ] 无 token 冷启动 → 免费版门闸生效（如 AI 日限）  
- [ ] Device Flow 完成 + 已 Star → 专业版；About 显示 Pro  
- [ ] 取消 Star 后杀进程再开（有网）→ 回免费版  
- [ ] 飞行模式启动（曾是 Pro）→ 免费版  
- [ ] 撤销 OAuth / 401 → 清 token，回免费并提示重授权  
- [ ] 未 Enable Device Flow 时错误可理解  

## 12. Open points（实现期可定默认）

- Device Flow `scope` 取最小可用值（优先空或文档推荐）。  
- Token 是否用现有加密金库封装：有则复用，无则 Preferences + 文件权限。  
- `license.lic` 与 Star 并存时 UI 优先级文案。

## Spec self-review

- [x] 无 TBD 占位阻塞实现（scope 有默认策略）  
- [x] 与「无网=免费、每次启动复验」一致，无「永久解锁」矛盾  
- [x] 不依赖 stargazers 列表 API  
- [x] Client Secret 明确禁止进客户端  
- [x] 范围限于授权 + 门闸 + About；不含 Marketplace  
