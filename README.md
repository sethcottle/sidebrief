<img src="https://cdn.cottle.cloud/tinyextensions/sidebrief/icon.gif" alt="Sidebrief icon" width="128" height="128">

# Sidebrief for Kagi Summarizer

Summarize any web page using the [Kagi Universal Summarizer](https://kagi.com/summarizer), right from your browser sidebar. Available for Chrome and Firefox.

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Chrome](https://img.shields.io/badge/Chrome-Supported-4285F4?logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-Supported-FF7139?logo=firefox-browser&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)

[![GitHub Sponsors](https://img.shields.io/badge/Sponsor-GitHub-ea4aaa?logo=github&logoColor=white)](https://github.com/sponsors/sethcottle)
[![Ko-fi](https://img.shields.io/badge/Support-Ko--fi-FF5E5B?logo=ko-fi&logoColor=white)](https://ko-fi.com/sethcottle)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?logo=buymeacoffee&logoColor=black)](https://www.buymeacoffee.com/seth)
[![PayPal](https://img.shields.io/badge/Donate-PayPal-003087?logo=paypal&logoColor=white)](https://paypal.me/sethcottle)
[![Stripe](https://img.shields.io/badge/Donate-Stripe-635BFF?logo=stripe&logoColor=white)](https://donate.stripe.com/00w2887fC68Z8Ey0rP8g000)

## How It Works

Sidebrief opens a sidebar panel next to whatever page you're reading. Click the toolbar icon, use a keyboard shortcut, or right-click any link and a summary appears alongside the page. You can switch between a full summary and bullet-point key moments, change the summarization engine, or paste any URL to summarize a page you're not even on.

<video src="https://cdn.cottle.cloud/tinyextensions/sidebrief/DemoSidebrief.mp4" autoplay loop muted playsinline width="100%"></video>

> [!NOTE]
> Sidebrief uses each browser's native sidebar API. The [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) on Chrome and [sidebar_action](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction) on Firefox. **Safari and [Orion](https://kagi.com/orion/) do not currently support a sidebar API for extensions**, so versions for those browsers are not available yet.

## Features

- **Sidebar interface**: summaries appear in a side panel alongside the page you're reading
- **Summary or Key Moments**: toggle between a full summary and bullet-point key moments
- **Paste any URL**: summarize any page, not just the one you're on
- **Keyboard shortcuts**: open/close the sidebar, summarize, or get key moments without touching the mouse
- **Quick settings**: change engine and output language directly from the sidebar header
- **History**: recent summaries are saved locally so you can revisit them
- **Light and dark theme**: follows your system preference
- **Reduced motion**: respects `prefers-reduced-motion` for users who need it

## Keyboard Shortcuts

| Action | Default Shortcut |
|---|---|
| Toggle sidebar | `Alt+Shift+B` (`⌥ Shift B` on macOS) |
| Summarize current page | `Alt+Shift+S` (`⌥ Shift S` on macOS) |
| Key moments | `Alt+Shift+K` (`⌥ Shift K` on macOS) |

Shortcuts can be customized in your browser's extension shortcut settings:
- **Chrome:** `chrome://extensions/shortcuts`
- **Firefox:** `about:addons` → gear icon → Manage Extension Shortcuts

## Setup

1. Install the extension
2. Click the Sidebrief icon in your toolbar to open the sidebar
3. Summarize the current page or paste any URL

The **Cecil** engine works for free if you're signed into [kagi.com](https://kagi.com). For paid engines (Agnes, Daphne, Muriel), add your API token in the extension settings.

Get an API token at [kagi.com/settings/api](https://kagi.com/settings/api). See the [Summarizer API docs](https://help.kagi.com/kagi/api/summarizer.html) for pricing and usage details.

## Installing Sidebrief

Sidebrief is available for manual download and installation. Store listings coming soon.

#### For Chrome

Download the latest release and unzip it. Navigate to `chrome://extensions/` and enable "Developer mode" using the toggle in the top right corner. Click "Load unpacked" and select the unzipped folder.

#### For Firefox

Download the latest release and unzip it. Navigate to `about:debugging#/runtime/this-firefox` and click "Load Temporary Add-on", then select `manifest.json` from the `dist/firefox/` folder. For permanent installation, install from Firefox Add-ons (AMO) when available.

## Building from Source

The build script generates browser-specific builds from the shared source in `src/`:

```bash
./build.sh
```

This creates:
- `dist/chrome/`: Chrome build with Side Panel API manifest
- `dist/firefox/`: Firefox build with sidebar_action manifest

The JavaScript is identical across both builds. Only the `manifest.json` differs.

## Requested Permissions

Sidebrief requests a few permissions in the `manifest.json` file.

`activeTab` allows the extension to read the URL of the current tab when you trigger a summarization via toolbar click or keyboard shortcut.

`tabs` allows the extension to read tab URLs from the sidebar context, where `activeTab` alone is insufficient.

`contextMenus` allows the extension to add "Summarize" and "Key Moments" to the right-click menu.

`storage` allows the extension to save your preferences (engine, language, API token) and recent summary history using the browser's built-in extension storage.

`sidePanel` (Chrome only) allows the extension to open and manage the sidebar panel.

`kagi.com` (host permission) allows the extension to send summarization requests to the Kagi API.

#### Privacy

Sidebrief runs completely locally in your browser. The only data it stores are your settings preferences and recent summary history, which are kept in your browser's extension storage. The only external communication is sending URLs to the Kagi Summarizer API when you request a summary. It does not collect any analytics, it does not store any information about your tabs or browsing history, it does not send any data anywhere other than Kagi for summarization. Your data is yours and yours alone.

## License

Copyright (C) 2026 Seth Cottle

Sidebrief for Kagi Summarizer is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or any later version.

Sidebrief for Kagi Summarizer is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. Please see the [GNU General Public License](https://www.gnu.org/licenses/quick-guide-gplv3.html) for more details.

Inspired by the official [Kagi Summarizer Extension for Chrome](https://github.com/kagisearch/chrome_extension_summarizer).

---

Built by [Seth Cottle](https://seth.social). Part of [Tiny Extensions](https://tinyextensions.com). This is an unofficial extension and is not affiliated with, endorsed by, or connected to Kagi, Inc.
