<p align="center">
  <img src="public/logo.svg" width="100" height="100" alt="MakTabs Logo" />
</p>

# MakTabs

> **Stash open tabs into native browser bookmarks and organize bookmarks with an interactive drag-and-drop tree manager — with automatic cloud sync and zero data lock-in.**

MakTabs is an open-source, privacy-first browser extension and native bookmark manager inspired by OneTab. Instead of saving tabs into volatile local storage or a proprietary database, MakTabs stashes them directly into native browser bookmark folders under **Bookmarks Bar > makTabs** by default for instant 1-click access right from your browser toolbar.

By leveraging native browser bookmarks, your stashed sessions and organized bookmark collections inherit built-in cross-device synchronization (via Chrome Sync, Firefox Sync, or Edge Sync), remain accessible even if the extension is disabled, and eliminate the risk of session loss.

---

## ✨ Features

- **⚡ Interactive Breadcrumb Path Builder & Subfolder Creator**: Stash tabs directly into **makTabs** with 1 click, or expand the inline path builder on the main page to customize the destination path (`makTabs › music › flute › [Session Name]`), create new subfolders on the fly, toggle between subfolder wrapping or direct folder saving, and access recent destinations instantly.
- **🌐 Website Favicons & Fallback Monograms**: Crisp website favicons loaded directly from local browser cache without external trackers, paired with pastel monogram fallbacks.
- **💤 Memory Saver Mode (Lazy Tab Restore)**: Spawn dozens or hundreds of restored tabs without RAM lag, CPU throttling, or network overload. Background tabs are opened in a paused, ultra-lightweight state with the website's logo and title, and automatically wake up and navigate to the real URL the instant you switch to or focus on them.
- **🌲 Interactive Bookmarks Tree & Organizer**: Visualize your entire bookmarks hierarchy with full multi-level recursive folder traversal (subfolders, sub-subfolders, etc.), expandable/collapsible chevrons, and instant folder switching in list, grid, or tree views.
- **⚡ Dedicated makTabs Tree Navigation**: Quick-access makTabs section in the manager sidebar with real-time item counts and deep session hierarchy traversal.
- **↕️ Drag & Drop Reordering & Nesting**:
  - Reorder bookmarks within folders or move items between folders.
  - Move entire folders around, nest subfolders, or drop items directly onto sidebar folders at any depth.
  - Built-in circular hierarchy protection prevents accidental nesting loops.
- **🖥️ Dedicated Full-Page Manager**: Spacious, standalone dashboard (`manager.html`) opened as a pinned tab with recursive sidebar folder navigation, batch actions, and 1-click session restoration.
- **📑 In-Popup Bookmarks View**: Quick visual bookmark browser and organizer built directly into the extension popup.
- **🔍 Instant Search & Subfolder Location Discovery**: Real-time search across all bookmark titles and URLs across all subfolders. Search results display interactive folder breadcrumb trails for items outside makTabs root, enabling instant 1-click navigation into their containing folders.
- **🔔 Non-Intrusive Update Checker**: Lightweight, privacy-respecting update notifications (queried at most once every 4 days) with 1-click options to download the update, view source code, or permanently dismiss reminders for that version.
- **☁️ Native & Self-Hosted Cloud Sync**: Stored directly in native browser bookmark trees, synchronizing across all your devices automatically.
- **🛡️ Data Safety & URL Filtering**: Automatically skips non-bookmarkable internal browser tabs (such as `chrome://`, `edge://`, `about:`, and `devtools://`).
- **📌 Pinned Tab Protection**: Pinned tabs are automatically preserved and never stashed or closed.
- **🚀 Flexible Session Restoration**: Restore individual tabs or entire sessions in the current window or a new window, with options to keep or delete the session folder after restoring.
- **🌓 Dark & Light Modes**: Clean, responsive UI built with Svelte 5 that adapts seamlessly to your system theme.
- **🔒 Privacy First**: Zero telemetry, zero analytics, zero external servers. Your tab and bookmark data never leaves your browser ecosystem.

---

## 💡 Sync Freedom: Native Sync or Self-Hosted via Floccus

Because MakTabs saves tabs directly into native browser bookmarks, you have complete ownership over your sync backend:

- **Built-in Browser Sync**: Out-of-the-box syncing via Chrome Sync, Firefox Sync, or Edge Sync with zero setup.
- **Don't use Chrome / Google Sync?** We love and highly recommend [**Floccus Bookmark Sync**](https://github.com/floccusaddon/floccus/). With Floccus, your MakTabs bookmark folders sync seamlessly across browsers (Chrome, Firefox, Edge, Brave) and platforms via your own Nextcloud, WebDAV server, Git repository, or Google Drive. You get total privacy, data sovereignty, and cross-browser tab synchronization without vendor lock-in!

---

## 🛠️ Tech Stack

- **Framework**: [WXT](https://wxt.dev/) (Next-gen Web Extension Framework)
- **UI**: [Svelte 5](https://svelte.dev/) (using modern runes: `$state`, `$derived`, `$props`, `$effect`)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Target Specification**: Manifest V3 (Chrome, Edge, Brave, Firefox)

---

## 🔑 Permissions

MakTabs requests only the minimum permissions necessary:

| Permission | Purpose |
| :--- | :--- |
| `bookmarks` | Create, organize, read, move, and manage stashed tab folders and bookmarks. |
| `tabs` | Read URLs and titles of tabs to stash, close stashed tabs, and restore tabs. |
| `storage` | Save user preferences (target mode, active popup view, recent destination folders). |
| `favicon` | Read cached website favicons locally from the browser cache without external trackers (Chromium). |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` (or `pnpm` / `bun`)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/rain64x/maktabs.git
cd maktabs
npm install
```

### Development

Start the development server with live reload:

```bash
# Chromium (Chrome, Edge, Brave)
npm run dev

# Firefox
npm run dev:firefox
```

Load the unpacked extension:
- **Chrome / Edge**: Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `.output/chrome-mv3` folder.
- **Firefox**: Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and choose any file in `.output/firefox-mv2` (or Manifest V3 output).

### Type Checking & Linting

Run TypeScript and Svelte diagnostics:

```bash
npm run check
```

### Production Build

Compile optimized production extension bundles:

```bash
# Build for Chrome (MV3)
npm run build

# Build for Firefox
npm run build:firefox

# Create distributable zip packages
npm run zip
npm run zip:firefox
```

---

## 📁 Project Structure

```text
maktabs/
├── public/                     # Static assets and extension icons (16, 32, 48, 96, 128)
├── src/
│   ├── entrypoints/
│   │   ├── background.ts       # Extension service worker
│   │   ├── lazy/               # Memory Saver lazy placeholder tab (wake-on-focus)
│   │   │   ├── App.svelte      # Lightweight paused tab card with domain monogram
│   │   │   ├── index.html      # Snooze page HTML
│   │   │   ├── lazy.css        # Theme styles
│   │   │   └── main.ts         # Snooze mount script
│   │   ├── manager/            # Full-page Bookmarks Manager & Organizer
│   │   │   ├── App.svelte      # Manager application view (Tree / List / Grid)
│   │   │   ├── BookmarkTreeNode.svelte # Recursive main pane tree node component
│   │   │   ├── SidebarTreeNode.svelte  # Recursive sidebar folder tree component
│   │   │   ├── index.html      # Manager page HTML
│   │   │   ├── main.ts         # Manager mount script
│   │   │   └── manager.css     # Modern light/dark theme styles
│   │   └── popup/              # Extension popup UI (Svelte 5)
│   │       ├── App.svelte      # Stash panel + quick in-popup bookmarks browser
│   │       ├── app.css         # Popup styles
│   │       ├── index.html      # Popup HTML document
│   │       └── main.ts         # Popup mount script
│   └── lib/
│       └── bookmarks.ts        # Bookmark APIs, tree manipulation, stash logic & helpers
├── AGENTS.md                   # AI agent operating guidelines
├── LICENSE                     # MIT License
├── package.json                # Project scripts and dependencies
├── tsconfig.json               # TypeScript configuration
└── wxt.config.ts               # WXT extension configuration & manifest definitions
```

---

## 🤝 Contributing

Contributions, feature requests, and bug reports are welcome!
Feel free to check the [issues page](https://github.com/rain64x/maktabs/issues) or submit a pull request.

Please ensure all tests and type checks pass before submitting:
```bash
npm run check && npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
