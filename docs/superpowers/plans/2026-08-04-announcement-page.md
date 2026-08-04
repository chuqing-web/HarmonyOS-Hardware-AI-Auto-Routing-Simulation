# Announcement Page Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkboxes track progress.

**Goal:** Ship a bilingual GitHub Pages site + announcement JSON feed, and wire the HarmonyOS app to it.

**Architecture:** Zero-build static files in `Announcement_Page/`; App reads absolute HTTPS JSON; About website line points at Pages URL.

**Tech Stack:** HTML/CSS/JS, GitHub Pages, ArkTS service updates

---

### Task 1: Static site scaffold + assets
- Create `Announcement_Page/{index.html,css/styles.css,js/i18n.js,js/main.js,api/announcement.json,README.md}`
- Copy key images from `picture/` into `assets/images/`

### Task 2: App wiring
- Set `HomeAnnouncementService.endpoint` + bilingual field parse (prefer zh)
- Update `HomeAboutInfo.websiteLine`

### Task 3: Deploy prep
- README with Pages steps; optionally push to deploy repo if credentials allow
