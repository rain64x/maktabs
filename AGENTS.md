# AGENTS.md — AI Agent Guidelines for MakTabs

Welcome, AI agent! This repository contains **MakTabs**, an open-source browser extension that stashes open tabs into native browser bookmarks for built-in cross-device sync (via browser sync or self-hosted tools like [Floccus](https://github.com/floccusaddon/floccus/)).

Follow these core operating principles whenever working on this codebase:

---

## 1. 📖 Living Documentation Rule (Mandatory)

- **Keep `README.md` synchronized**: Whenever you add, modify, or remove features, configuration, or user-facing behaviors, **always update `README.md`** so the documentation accurately reflects the current state of the extension.
- **Don't leave obsolete documentation**: If an API, UI element, or permission is changed or retired, remove or update references to it across all markdown files.

---

## 2. 🎯 Core Architecture & Principles

- **Native Bookmarks Over Local Databases**: Tabs must be stashed into native browser bookmark trees (`browser.bookmarks`), never in volatile localStorage or closed proprietary databases.
- **Sync Sovereignty**: Support both browser-native sync (Chrome, Firefox, Edge) and open-source sync utilities like Floccus.
- **Data Safety & Scheme Filtering**: Always validate and sanitize URLs before creating bookmarks. Never attempt to stash unsupported browser-internal schemes (`chrome://`, `edge://`, `about:`, `devtools://`, `view-source:`, etc.).
- **Privacy First**: Zero telemetry, zero external trackers, and only request the minimum required permissions (`bookmarks`, `tabs`, `storage`).

---

## 3. 🛠️ Tech Stack & Conventions

- **Extension Framework**: [WXT](https://wxt.dev/) with Manifest V3.
- **UI Framework**: [Svelte 5](https://svelte.dev/) (use modern runes: `$state`, `$derived`, `$props`, `$effect`).
- **Language**: TypeScript with strict type checking.
- **Verification**: Always run `npm run check` and `npm run build` to ensure zero type errors and zero compilation warnings before finishing any task.

---

## 4. 📝 Commit Hygiene

- Keep commits atomic, well-scoped, and self-contained.
- Use clear, standard commit messages (e.g. `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`).
- Avoid mixing refactoring, feature work, and documentation changes unless explicitly planned as a setup or cleanup step.
