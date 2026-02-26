// Cross-browser namespace: Chrome <144 uses chrome.*, Firefox and Chrome 144+ use browser.*
const api = typeof browser !== 'undefined' ? browser : chrome;

// Set uninstall survey URL
api.runtime.setUninstallURL('https://tinyextensions.com/uninstall?ext=sidebrief');

// --- Make toolbar icon open the sidebar ---
if (api.sidePanel) {
  // Chrome: clicking the action icon opens the side panel
  api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
} else if (api.sidebarAction) {
  // Firefox/Zen: clicking the action icon toggles the sidebar
  api.action.onClicked.addListener(() => {
    api.sidebarAction.toggle();
  });
}

// --- Cache focused window ID for sidePanel.open() ---
// sidePanel.open() must be called synchronously in user gesture handlers.
// Any preceding await (like tabs.query) breaks the gesture chain.
// We cache the window ID so we can call sidePanel.open() immediately.
let lastFocusedWindowId = null;

if (api.windows?.onFocusChanged) {
  api.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== api.windows.WINDOW_ID_NONE) {
      lastFocusedWindowId = windowId;
    }
  });
}

// Seed the cache on startup
api.windows?.getLastFocused?.().then((win) => {
  if (win?.id) lastFocusedWindowId = win.id;
}).catch(() => {});

// --- Settings ---
async function getSettings() {
  const result = await api.storage.sync.get('summarizer_settings');
  return result?.summarizer_settings || {};
}

// --- Context Menus ---
function createContextMenus() {
  api.contextMenus.create({
    id: 'kagi-summarize',
    title: 'Sidebrief: Summarize',
    contexts: ['link', 'page'],
  });
  api.contextMenus.create({
    id: 'kagi-key-moments',
    title: 'Sidebrief: Key Moments',
    contexts: ['link', 'page'],
  });
}

// --- Install / Update ---
api.runtime.onInstalled.addListener(async (details) => {
  createContextMenus();

  // Migrate settings from storage.local to storage.sync on update
  if (details.reason === 'update') {
    try {
      const local = await api.storage.local.get('summarizer_settings');
      if (local?.summarizer_settings) {
        const sync = await api.storage.sync.get('summarizer_settings');
        if (!sync?.summarizer_settings) {
          await api.storage.sync.set({ summarizer_settings: local.summarizer_settings });
          await api.storage.local.remove('summarizer_settings');
        }
      }
    } catch (e) {
      console.error('Settings migration failed:', e);
    }
  }
});

// --- Context Menu Click ---
api.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.pageUrl;
  const summaryType = info.menuItemId === 'kagi-key-moments' ? 'takeaway' : 'summary';

  // Chrome: open side panel programmatically
  if (api.sidePanel && tab) {
    try {
      await api.sidePanel.open({ windowId: tab.windowId });
    } catch (e) {
      console.error('Failed to open side panel:', e);
    }
  }

  // Give sidebar time to initialize, then send the URL
  setTimeout(() => {
    api.runtime.sendMessage({
      type: 'summarize_url',
      url: url,
      summary_type: summaryType,
    }).catch(() => {
      // Sidebar may not be ready yet — that's ok
    });
  }, 500);
});

// --- Keyboard Shortcuts ---
// IMPORTANT: Do NOT make this listener async. sidePanel.open() must be called
// synchronously in the user gesture handler — any preceding await breaks it.
api.commands.onCommand.addListener((command) => {
  // open-sidebar: toggle — open if closed, close if already open
  if (command === 'open-sidebar') {
    if (api.sidePanel && lastFocusedWindowId) {
      // Chrome: open synchronously (no-op if already open, required for gesture chain)
      api.sidePanel.open({ windowId: lastFocusedWindowId }).catch(() => {});
      // After a short delay, tell the sidebar to toggle — it uses its own load
      // timestamp to decide: if it was already alive, close; if just opened, stay.
      setTimeout(() => {
        api.runtime.sendMessage({ type: 'toggle_sidebar' }).catch(() => {});
      }, 300);
    } else if (api.sidebarAction) {
      // Firefox/Zen: toggle the sidebar directly
      api.sidebarAction.toggle();
    }
    return;
  }

  // Open sidebar IMMEDIATELY (no await before this)
  if (api.sidePanel && lastFocusedWindowId) {
    api.sidePanel.open({ windowId: lastFocusedWindowId }).catch((e) => {
      console.error('Failed to open side panel:', e);
    });
  } else if (api.sidebarAction) {
    api.sidebarAction.open();
  }

  if (command !== 'summarize-page' && command !== 'key-moments') return;

  // Then do async work to get the tab URL and send the summarize message
  api.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    let url = tab?.url || '';

    if (url.startsWith('about:reader?url=')) {
      try {
        url = new URL(url).searchParams.get('url');
      } catch (e) {
        // Fall through
      }
    }

    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      const summaryType = command === 'key-moments' ? 'takeaway' : 'summary';
      setTimeout(() => {
        api.runtime.sendMessage({
          type: 'summarize_url',
          url: url,
          summary_type: summaryType,
        }).catch(() => {});
      }, 500);
    }
  });
});

// --- Message Router ---
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'do_summarize') {
    summarizeContent(message).then(sendResponse).catch((err) => {
      sendResponse({ summary: `Error: ${err.message}`, success: false, timeSavedInMinutes: 0 });
    });
    return true; // Keep channel open for async sendResponse
  }

  if (message.type === 'get_active_tab_url') {
    api.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const tab = tabs[0];
      let url = tab?.url || '';
      // Handle Firefox reader mode
      if (url.startsWith('about:reader?url=')) {
        try {
          url = new URL(url).searchParams.get('url');
        } catch (e) {
          // Fall through
        }
      }
      sendResponse({ url, title: tab?.title || '' });
    }).catch(() => {
      sendResponse({ url: '', title: '' });
    });
    return true;
  }
});

// --- Summarize API Call ---
async function summarizeContent({ url, text, summary_type }) {
  const settings = await getSettings();

  let summary = 'Unknown error';
  let success = false;
  let timeSavedInMinutes = 0;
  let errorType = null; // 'auth_token' | 'auth_signin' | null

  const engine = (settings.engine === 'daphne' ? 'agnes' : settings.engine) || 'cecil';
  const apiToken = settings.api_token || '';
  const targetLanguage = settings.target_language || '';
  const summaryType = summary_type || settings.summary_type || 'summary';

  // Text input always requires an API token (no free fallback)
  if (text && !apiToken) {
    return {
      summary: 'Text summarization requires an API token. Add one in Settings.',
      success: false,
      timeSavedInMinutes: 0,
      errorType: 'auth_token',
    };
  }

  // Paid engine without token silently falls back to Cecil (free)
  // fallbackReason: null | 'no_token' | 'insufficient_credit'
  let fallbackReason = (engine !== 'cecil' && !apiToken) ? 'no_token' : null;
  const useApi = Boolean(apiToken && (engine !== 'cecil' || text));

  try {
    const requestParams = { url, summary_type: summaryType };

    if (targetLanguage) {
      requestParams.target_language = targetLanguage;
    }

    if (useApi) {
      if (engine) {
        requestParams.engine = engine;
      }
      if (text) {
        requestParams.text = text;
        requestParams.url = undefined;
      }
    }

    const headers = { 'Content-Type': 'application/json' };
    if (useApi) {
      headers['Authorization'] = `Bot ${apiToken}`;
    }

    // Use POST with JSON body for text input (GET query params hit URL length limits)
    // Use GET with query params for URL input (preserves existing behavior)
    let response;
    if (text && useApi) {
      response = await fetch(
        'https://kagi.com/api/v0/summarize',
        { method: 'POST', headers, body: JSON.stringify(requestParams) },
      );
    } else {
      const searchParams = new URLSearchParams(requestParams);
      response = await fetch(
        `${useApi ? 'https://kagi.com/api/v0/summarize' : 'https://kagi.com/mother/summary_labs'}?${searchParams.toString()}`,
        { method: 'GET', headers, credentials: 'include' },
      );
    }

    if (response.status === 200) {
      const result = await response.json();

      if (useApi) {
        if (result.data?.output) {
          summary = result.data.output;
        } else if (result.error) {
          summary = JSON.stringify(result.error);
        }
      } else {
        summary = result?.output_text || 'Unknown error';
        timeSavedInMinutes = result?.output_data?.word_stats?.time_saved || 0;

        // Free API returns 200 with "Unauthorized" in output_text when not signed in
        if (summary.trim().toLowerCase() === 'unauthorized') {
          summary = 'Unauthorized. Please make sure you are signed in to kagi.com, or add an API key in Settings.';
          errorType = 'auth_signin';
        }
      }

      success = Boolean(result) && !Boolean(result.error) && !errorType;
    } else {
      if (response.status === 401) {
        if (useApi) {
          summary = 'Your API token appears to be invalid or expired. Please check your API token in Settings.';
          errorType = 'auth_token';
        } else {
          summary = 'Unauthorized. Please make sure you are signed in to kagi.com, or add an API key in Settings.';
          errorType = 'auth_signin';
        }
      } else if (response.status === 429) {
        summary = 'Kagi is rate limiting requests. Please wait a moment and try again.';
        errorType = 'kagi_rate_limit';
      } else if (response.status === 502 || response.status === 503) {
        summary = 'Kagi\'s summarization service is temporarily unavailable. Please try again in a few minutes.';
        errorType = 'kagi_unavailable';
      } else if (response.status === 504) {
        summary = 'Kagi\'s summarization service timed out. This can happen with long videos or complex pages. Try a shorter video or page, or try again later.';
        errorType = 'kagi_timeout';
      } else {
        let isInsufficientCredit = false;
        try {
          const contentType = response.headers.get('Content-Type');
          if (contentType && contentType.includes('application/json')) {
            const result = await response.json();
            if (result.error && result.error.length > 0) {
              const error = result.error[0];
              // Check for insufficient credit — fall back to Cecil for URL requests
              if (error.code === 101 && url && !text) {
                isInsufficientCredit = true;
              } else {
                summary = `Error: ${error.code} — ${error.msg}`;
              }
            } else {
              summary = `Error: ${response.status}`;
            }
          } else {
            summary = `Error: ${response.status} — ${response.statusText}`;
          }
        } catch (e) {
          summary = `Error: ${response.status} — ${response.statusText}`;
        }

        // Log non-recoverable errors
        if (!isInsufficientCredit) {
          console.error('Summarize error:', response.status, response.statusText);
        }

        // Retry with free Cecil endpoint on insufficient credit (URL only)
        if (isInsufficientCredit) {
          try {
            const freeParams = new URLSearchParams({ url, summary_type: summaryType });
            if (targetLanguage) freeParams.set('target_language', targetLanguage);
            const freeResponse = await fetch(
              `https://kagi.com/mother/summary_labs?${freeParams.toString()}`,
              { method: 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'include' },
            );
            if (freeResponse.status === 200) {
              const freeResult = await freeResponse.json();
              summary = freeResult?.output_text || 'Unknown error';
              timeSavedInMinutes = freeResult?.output_data?.word_stats?.time_saved || 0;
              if (summary.trim().toLowerCase() !== 'unauthorized') {
                success = true;
                fallbackReason = 'insufficient_credit';
              } else {
                summary = 'Unauthorized. Please make sure you are signed in to kagi.com, or add an API key in Settings.';
                errorType = 'auth_signin';
              }
            } else {
              summary = 'Insufficient API credits and free fallback failed. Please add credits or sign in to kagi.com.';
            }
          } catch (e) {
            summary = 'Insufficient API credits and free fallback failed.';
          }
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError' || (error.message && error.message.toLowerCase().includes('timeout'))) {
      summary = 'The request to Kagi timed out. This can happen with long videos or complex pages. Try a shorter video or page, or try again later.';
      errorType = 'kagi_timeout';
    } else if (error.message && error.message.toLowerCase().includes('failed to fetch')) {
      summary = 'Could not connect to Kagi. Please check your internet connection and try again.';
      errorType = 'kagi_network';
    } else {
      summary = error.message ? `Error: ${error.message}` : JSON.stringify(error);
    }
  }

  return { summary, success, timeSavedInMinutes, errorType, fallbackReason, engine };
}
