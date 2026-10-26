<p align="center">
  <img src="public/logo.svg" width="100" height="100" alt="MakTabs Logo" />
</p>

# MakTabs

> **Stash open tabs into native browser bookmarks — with automatic cloud sync, zero data lock-in, and OneTab migration.**

MakTabs is an open-source, privacy-first browser extension inspired by OneTab. Instead of saving tabs into volatile local storage or a proprietary database, MakTabs stashes them directly into native browser bookmark folders.

By leveraging browser bookmarks, your stashed sessions inherit built-in cross-device synchronization (via Chrome Sync, Firefox Sync, or Edge Sync), remain accessible even if the extension is disabled, and eliminate the risk of session loss.

---

## ✨ Features

- **⚡ Instant Stashing**: Stash current tab or current window with a single click, placing newer sessions at the top by default.
- **☁️ Native & Self-Hosted Cloud Sync**: Sessions are stored directly in native bookmark folders, synchronizing across all your devices automatically.
- **📥 OneTab Importer**: Effortlessly migrate existing OneTab export lists (`URL | Title`) into organized, timestamped bookmark sessions.
- **🛡️ Data Safety & URL Filtering**: Automatically skips non-bookmarkable internal browser tabs (such as `chrome://`, `edge://`, `about:`, and `devtools://`).
- **📌 Pinned Tab Protection**: Pinned tabs are automatically preserved and never stashed or closed.
- **📂 Customizable Folder Hierarchy**: Store sessions in a default `MakTabs` folder or pick any custom bookmark folder.
- **🚀 Flexible Restoration**: Restore individual tabs or entire sessions in the current window or a new window, with options to keep or delete the bookmarks after restoring.
- **🌓 Dark & Light Modes**: Clean, responsive UI built with Svelte 5 that adapts to your system theme.
- **🔒 Privacy First**: No tracking, no analytics, no external servers. Your tab data never leaves your browser ecosystem.

---

## 💡 Sync Freedom: Native Sync or Self-Hosted via Floccus

Because MakTabs saves tabs directly into native browser bookmarks, you have complete ownership over your sync backend:

- **Built-in Browser Sync**: Out-of-the-box syncing via Chrome Sync, Firefox Sync, or Edge Sync with zero setup.
- **Don't use Chrome / Google Sync?** We love and highly recommend [**Floccus Bookmark Sync**](https://github.com/floccusaddon/floccus/). With Floccus, your MakTabs bookmark folders sync seamlessly across browsers (Chrome, Firefox, Edge, Brave) and platforms via your own Nextcloud, WebDAV server, Git repository, or Google Drive. You get total privacy, data sovereignty, and cross-browser tab synchronization without vendor lock-in!

---

## 🛠️ Tech Stack

- **Framework**: [WXT](https://wxt.dev/) (Next-gen Web Extension Framework)
- **UI**: [Svelte 5](https://svelte.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Bundler**: [Vite](https://vitejs.dev/)
- **Target Specification**: Manifest V3 (Chrome, Edge, Brave, Firefox)

---

## 🔑 Permissions

MakTabs requests only the minimum permissions necessary:

| Permission | Purpose |
| :--- | :--- |
| `bookmarks` | Create, organize, read, and manage stashed tab folders and bookmarks. |
| `tabs` | Read URLs and titles of tabs to stash, close stashed tabs, and restore tabs. |
| `storage` | Save user preferences (custom root folder ID, pinned tabs handling, restore mode). |

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
├── public/                 # Static assets and extension icons (16, 32, 48, 96, 128)
├── src/
│   ├── entrypoints/
│   │   ├── background.ts   # Extension service worker
│   │   └── popup/          # Popup UI entrypoint (Svelte 5)
│   │       ├── App.svelte  # Root popup component
│   │       ├── app.css     # Theme & layout styles
│   │       ├── index.html  # Popup HTML document
│   │       └── main.ts     # Mount script
│   └── lib/                # Services and utilities
├── AGENTS.md               # AI agent operating guidelines
├── LICENSE                 # MIT License
├── package.json            # Project scripts and dependencies
├── tsconfig.json           # TypeScript configuration
└── wxt.config.ts           # WXT extension configuration & manifest definitions
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
