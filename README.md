# ⌨️ CodeTeller

> **Review your code, byte by byte.**

CodeTeller is a browser-based "typewriter" code replay tool. It loads source code from a local folder, a ZIP archive, or a GitHub repository, and then plays it back character-by-character (or word-by-word) while rendering beautiful syntax highlighting and showing progress in a dynamic file tree.

---

## ✨ The Experience

- 🌳 **Interactive File Tree:** A file tree on the left dynamically "creates" directories and files as they are reached in the queue.
- ✍️ **Typewriter Effect:** The code area on the right features a typewriter-style cursor that moves organically as text is revealed.
- 🎬 **Seamless Playback:** The app smoothly transitions from file to file, typing out the content in order.
- 🔍 **Post-Playback Browsing:** Once the replay finishes, you can freely click any file in the tree to browse its final content.

## 🚀 Quick Start

### 1. Try the Live Demo

No installation required! Play with the hosted version here:
👉 **[steve02081504.github.io/CodeTeller](https://steve02081504.github.io/CodeTeller/)**

**How to use:**

- Click **Open folder** or **Open ZIP**.
- Drag and drop a folder, ZIP, text files, or a GitHub URL onto the page.
- Paste a GitHub repository (`owner/repo`) and click **Load repository**.

### 2. Auto-load via URL

You can share a link that automatically loads a specific repository or ZIP file using the `?url=` or `?source=` parameters:

- **GitHub Repo:** `.../?url=steve02081504/fount` [(Try it!)](https://steve02081504.github.io/CodeTeller/?url=steve02081504/fount)
- **ZIP File:** `.../?url=https://example.com/source.zip`

### 3. Run Locally (Self-Hosting)

If you want to run CodeTeller locally, you must use a static web server (opening `index.html` directly via `file://` may fail due to ES modules and Worker security restrictions).

```bash
# Example using Python
python -m http.server 5173

# Then open http://localhost:5173/index.html in your browser
```

## 🛠 Features

### 📦 Versatile Inputs

- **Local Folder:** Uses the File System Access API (with Worker streaming support) for fast, local reading.
- **ZIP Archive:** Load via local file input or remote URL.
- **GitHub Repository:** Paste a full URL or `owner/repo`. Supports optional personal access tokens to bypass rate limits.
- **Drag-and-Drop:** Intuitive drag-and-drop support across all input types.

### 🎛 Playback Controls

- **Modes:** Choose between `Auto` (continuous playback) or `Manual` (step-by-step via keyboard).
- **Step Size:** Advance by a single `char` or a full `word` (skips whitespace intelligently).
- **Speed Control:** Adjustable slider from `1` to `500` chars/s.
- **Actions:** Play/Pause, Reset, Skip current file, or Jump immediately to the end.

### 🎨 Rendering & UI

- **Syntax Highlighting:** Powered by [Shiki](https://shiki.style/), matching your page's light/dark theme.
- **Smart Scrolling:** The cursor automatically stays in view during playback.
- **Preferences:** Language (English/Chinese/Japanese) and Theme (Auto/Light/Dark) are automatically persisted in `localStorage`.

## ⚠️ Limitations & Filtering

To maintain a responsive UI and smooth animations, CodeTeller applies intelligent filtering:

- **Binary Skipping:** Automatically ignores non-text files based on extensions (images, audio, executables).
- **Encoding Checks:** Skips files with a high ratio of non-printable characters after UTF-8 decoding.
- **GitHub Limits:** When fetching from GitHub, caps are applied to the maximum number of files, file sizes, and total processed content. *Note: For massive repositories, you may only see a subset of the codebase.*

## 🔒 Privacy & Security

- **Local Processing:** Local folders and ZIP contents are processed entirely within your browser. No code is uploaded to any server.
- **GitHub API:** GitHub loading fetches data directly from your browser to `api.github.com`. Your optional access token is saved securely in your browser's `localStorage` and is never shared.
- **CORS Proxies:** Loading a remote ZIP by URL may fall back to a public CORS proxy if direct fetching fails.
