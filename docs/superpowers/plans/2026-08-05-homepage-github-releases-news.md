# HomePage News ← GitHub Releases

## Goal
Replace hardcoded News list with live GitHub Releases for
`chuqing-web/HarmonyOS-Hardware-AI-Auto-Routing-Simulation`.

## Behavior
- GET `/releases?per_page=20` (no auth)
- Fail → empty + status「网络不稳定」; empty list →「暂无 Release」
- Keep Sample tutorials row
- Exactly 1 `.hap` → Download/Update; else Unavailable
- In Use: normalize(tag) === APP_VERSION_NAME
- Update + red dots: highest newer tag with sole .hap
- Download to `filesDir/downloads/`, then try system install Want

## Files
- `entry/.../services/HomeReleaseService.ets` (new)
- `entry/.../pages/HomePage.ets`
- `entry/.../components/proteus/ProteusHomeWidgets.ets`
