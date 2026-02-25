#!/bin/bash
# Build script for Sidebrief for Kagi Summarizer
# Produces dist/chrome/ and dist/firefox/ with browser-specific manifests
# Version is read from the root manifest.json (single source of truth)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/src"
DIST_DIR="$SCRIPT_DIR/dist"
SHARED_FILES="background.js sidebar.html sidebar.js sidebar.css options.html options.js options.css summarize.svg"

# Read version from root manifest.json
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$SCRIPT_DIR/manifest.json")
echo "Building Sidebrief v${VERSION}..."

# Clean previous builds
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/chrome" "$DIST_DIR/firefox"

# Copy shared source files to both targets
for file in $SHARED_FILES; do
  cp "$SRC_DIR/$file" "$DIST_DIR/chrome/$file"
  cp "$SRC_DIR/$file" "$DIST_DIR/firefox/$file"
done

# Copy icons to both targets
mkdir -p "$DIST_DIR/chrome/icons" "$DIST_DIR/firefox/icons"
for icon in icon16.png icon32.png icon48.png icon128.png; do
  cp "$SCRIPT_DIR/icons/$icon" "$DIST_DIR/chrome/icons/$icon"
  cp "$SCRIPT_DIR/icons/$icon" "$DIST_DIR/firefox/icons/$icon"
done

# Remove .DS_Store files from builds
find "$DIST_DIR" -name '.DS_Store' -delete 2>/dev/null || true

# Chrome manifest: service_worker + sidePanel
cat > "$DIST_DIR/chrome/manifest.json" << EOF
{
  "manifest_version": 3,
  "name": "Sidebrief for Kagi Summarizer",
  "version": "${VERSION}",
  "description": "Summarize any page with Kagi Universal Summarizer",
  "permissions": [
    "activeTab",
    "tabs",
    "contextMenus",
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "https://kagi.com/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "side_panel": {
    "default_path": "sidebar.html"
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": true
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "open-sidebar": {
      "suggested_key": {
        "default": "Alt+Shift+B"
      },
      "description": "Open Sidebrief sidebar"
    },
    "summarize-page": {
      "suggested_key": {
        "default": "Alt+Shift+S"
      },
      "description": "Summarize the current page"
    },
    "key-moments": {
      "suggested_key": {
        "default": "Alt+Shift+K"
      },
      "description": "Get key moments from the current page"
    }
  }
}
EOF

# Firefox manifest: scripts array + sidebar_action + gecko settings
cat > "$DIST_DIR/firefox/manifest.json" << EOF
{
  "manifest_version": 3,
  "name": "Sidebrief for Kagi Summarizer",
  "version": "${VERSION}",
  "description": "Summarize any page with Kagi Universal Summarizer",
  "permissions": [
    "activeTab",
    "tabs",
    "contextMenus",
    "storage"
  ],
  "host_permissions": [
    "https://kagi.com/*"
  ],
  "background": {
    "scripts": ["background.js"]
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "Sidebrief for Kagi Summarizer"
  },
  "sidebar_action": {
    "default_panel": "sidebar.html",
    "default_title": "Sidebrief for Kagi Summarizer",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png"
    }
  },
  "options_ui": {
    "page": "options.html",
    "open_in_tab": false
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "commands": {
    "open-sidebar": {
      "suggested_key": {
        "default": "Alt+Shift+B"
      },
      "description": "Open Sidebrief sidebar"
    },
    "summarize-page": {
      "suggested_key": {
        "default": "Alt+Shift+S"
      },
      "description": "Summarize the current page"
    },
    "key-moments": {
      "suggested_key": {
        "default": "Alt+Shift+K"
      },
      "description": "Get key moments from the current page"
    }
  },
  "browser_specific_settings": {
    "gecko": {
      "id": "summarizer@sethcottle.com",
      "strict_min_version": "121.0",
      "data_collection_permissions": {
        "required": ["none"],
        "optional": []
      }
    }
  }
}
EOF

echo "Build complete (v${VERSION}):"
echo "  Chrome:  $DIST_DIR/chrome/"
echo "  Firefox: $DIST_DIR/firefox/"
