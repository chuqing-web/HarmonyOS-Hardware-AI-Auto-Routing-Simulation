# GitHub Star OAuth Unlock — Implementation Plan

> **For agentic workers:** Execute task-by-task. Spec: `docs/superpowers/specs/2026-08-04-github-star-oauth-unlock-design.md`

**Goal:** Restore free/pro gating; unlock Pro via GitHub Device Flow + Star check; revalidate every launch; offline = Free.

**Architecture:** `GitHubDeviceAuth` + `GitHubStarVerifier` in `common`; `LicenseManager` session flag `starUnlockActive`; About UI Device Flow dialog; AppService startup revalidate.

**Tech Stack:** ArkTS, `@ohos.net.http`, Preferences, GitHub Device Flow REST.

---

## Files

| File | Action |
|------|--------|
| `common/.../GitHubOAuthConfig.ets` | Create |
| `common/.../GitHubDeviceAuth.ets` | Create |
| `common/.../GitHubStarVerifier.ets` | Create |
| `common/.../LicenseManager.ets` | Restore tiers + star session |
| `common/.../FeatureGate.ets` | Restore gates |
| `common/Index.ets` | Export new APIs |
| `entry/.../AppService.ets` | Startup revalidate |
| `entry/.../HomeAboutInfo.ets` | License line + evaluation |
| `entry/.../HomePage.ets` | Unlock UI |
| `features/.../QuotaTracker.ets` | Billing note by tier |
| README*.md | Brief unlock docs |

## Tasks

- [x] Plan written
- [x] Config + Device Auth + Star Verifier
- [x] LicenseManager / FeatureGate restore
- [x] AppService + About UI
- [x] Docs / README
