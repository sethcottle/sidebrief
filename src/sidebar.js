// Cross-browser namespace
const api = typeof browser !== 'undefined' ? browser : chrome;

// --- Theme Colors ---
// Each color has a vivid light-mode variant and a dark-mode variant.
// textLight/textDark = text color on accent background per mode.
const themeColors = {
  yellow:   { light: '#C58A00', dark: '#ffb319', hoverLight: '#A87600', hoverDark: '#ffc94d', textLight: '#ffffff', textDark: '#191919' },
  orange:   { light: '#D4580A', dark: '#FB923C', hoverLight: '#B84A08', hoverDark: '#FDBA74', textLight: '#ffffff', textDark: '#191919' },
  purple:   { light: '#7C3AED', dark: '#A78BFA', hoverLight: '#6D28D9', hoverDark: '#C4B5FD', textLight: '#ffffff', textDark: '#191919' },
  sky:      { light: '#0878B0', dark: '#38BDF8', hoverLight: '#066898', hoverDark: '#7DD3FC', textLight: '#ffffff', textDark: '#191919' },
  grass:    { light: '#178A42', dark: '#4ADE80', hoverLight: '#137536', hoverDark: '#86EFAC', textLight: '#ffffff', textDark: '#191919' },
  graphite: { light: '#4B5563', dark: '#9CA3AF', hoverLight: '#374151', hoverDark: '#D1D5DB', textLight: '#ffffff', textDark: '#191919' },
};

// --- State ---
let currentUrl = '';
let currentPageUrl = ''; // Tracks the actual active tab URL
let isLoading = false;
let historyOpen = false;
const sidebarOpenedAt = Date.now();

// --- DOM refs ---
let el = {};

// --- Theme Color ---
function applyThemeColor(colorName) {
  const color = themeColors[colorName] || themeColors.yellow;
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.style.setProperty('--accent', isDark ? color.dark : color.light);
  root.style.setProperty('--accent-hover', isDark ? color.hoverDark : color.hoverLight);
  root.style.setProperty('--accent-text', isDark ? color.textDark : color.textLight);
}

let currentThemeColor = 'yellow';

async function loadThemeColor() {
  const result = await api.storage.sync.get('summarizer_settings');
  currentThemeColor = result?.summarizer_settings?.theme_color || 'yellow';
  applyThemeColor(currentThemeColor);
}

// Re-apply when system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  applyThemeColor(currentThemeColor);
});

// Live update when user changes color in options
api.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.summarizer_settings) {
    const newColor = changes.summarizer_settings.newValue?.theme_color;
    if (newColor && newColor !== currentThemeColor) {
      currentThemeColor = newColor;
      applyThemeColor(currentThemeColor);
    }
  }
});

// --- Initialize ---
document.addEventListener('DOMContentLoaded', async () => {
  await loadThemeColor();
  cacheElements();
  setupShortcutLabel();
  setupListeners();
  await loadSavedType();
  await loadQuickSettings();
  await renderHistory();
  // Don't auto-summarize on load — wait for an explicit trigger
  // (Alt+Shift+S, context menu, or user clicking "Summarize this Page")
  showState('empty');
});

function cacheElements() {
  el = {
    urlInput: document.getElementById('url-input'),
    summarizeBtn: document.getElementById('summarize-btn'),
    clearUrlBtn: document.getElementById('clear-url-btn'),
    useCurrentPage: document.getElementById('use-current-page'),
    summarizePageBtn: document.getElementById('summarize-page-btn'),
    shortcutKey: document.getElementById('shortcut-key'),
    typeSummary: document.getElementById('type-summary'),
    typeTakeaway: document.getElementById('type-takeaway'),
    stateEmpty: document.getElementById('state-empty'),
    stateLoading: document.getElementById('state-loading'),
    stateResult: document.getElementById('state-result'),
    stateError: document.getElementById('state-error'),
    summaryContent: document.getElementById('summary-content'),
    errorMessage: document.getElementById('error-message'),
    errorActions: document.getElementById('error-actions'),
    footer: document.getElementById('sidebar-footer'),
    timeSaved: document.getElementById('time-saved'),
    copyBtn: document.getElementById('copy-btn'),
    copyLabel: document.getElementById('copy-label'),
    redoBtn: document.getElementById('redo-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    quickSettingsBtn: document.getElementById('quick-settings-btn'),
    quickDropdown: document.getElementById('quick-settings-dropdown'),
    quickEngine: document.getElementById('quick-engine'),
    quickLanguage: document.getElementById('quick-language'),
    historySection: document.getElementById('history-section'),
    historyToggle: document.getElementById('history-toggle'),
    historyList: document.getElementById('history-list'),
    historyCount: document.getElementById('history-count'),
  };
}

// --- Platform Detection ---
function isMac() {
  // Use modern API if available, fall back to navigator.platform
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform === 'macOS';
  }
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

function updateShortcutLabel() {
  if (el.shortcutKey) {
    const isTakeaway = getActiveType() === 'takeaway';
    el.shortcutKey.textContent = isMac()
      ? (isTakeaway ? '⌥⇧K' : '⌥⇧S')
      : (isTakeaway ? 'Alt+Shift+K' : 'Alt+Shift+S');
  }
}

function setupShortcutLabel() {
  updateShortcutLabel();
}

function setupListeners() {
  // Settings button → options page
  el.settingsBtn.addEventListener('click', () => {
    api.runtime.openOptionsPage();
  });

  // Summarize button (arrow in URL bar)
  el.summarizeBtn.addEventListener('click', handleUrlSubmit);

  // Enter key in URL input
  el.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUrlSubmit();
    }
  });

  // URL input — show/hide clear button as user types
  el.urlInput.addEventListener('input', updateUrlBarButtons);

  // Clear URL button
  el.clearUrlBtn.addEventListener('click', () => {
    el.urlInput.value = '';
    el.urlInput.focus();
    updateUrlBarButtons();
  });

  // "Summarize current page" text button (below URL bar)
  el.useCurrentPage.addEventListener('click', () => {
    summarizeCurrentPage();
  });

  // Summarize this Page button (in empty state)
  el.summarizePageBtn.addEventListener('click', () => {
    summarizeCurrentPage();
  });

  // Type toggle buttons
  el.typeSummary.addEventListener('click', () => setActiveType('summary'));
  el.typeTakeaway.addEventListener('click', () => setActiveType('takeaway'));

  // Copy button
  el.copyBtn.addEventListener('click', handleCopy);

  // Redo button
  el.redoBtn.addEventListener('click', () => {
    if (currentUrl) runSummarize(currentUrl);
  });

  // Quick settings dropdown
  el.quickSettingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const visible = el.quickDropdown.style.display !== 'none';
    el.quickDropdown.style.display = visible ? 'none' : '';
  });

  // Quick engine/language change — save immediately
  el.quickEngine.addEventListener('change', () => {
    saveQuickSetting('engine', el.quickEngine.value);
  });
  el.quickLanguage.addEventListener('change', () => {
    saveQuickSetting('target_language', el.quickLanguage.value);
  });

  // Close dropdown when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!el.quickDropdown.contains(e.target) && e.target !== el.quickSettingsBtn) {
      el.quickDropdown.style.display = 'none';
    }
  });

  // History toggle
  el.historyToggle.addEventListener('click', () => {
    historyOpen = !historyOpen;
    el.historyList.style.display = historyOpen ? '' : 'none';
    el.historyToggle.classList.toggle('open', historyOpen);
  });

  // Listen for external triggers (context menu, keyboard shortcut, toggle)
  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'toggle_sidebar') {
      // If sidebar existed before the shortcut was pressed, close it.
      // If it was just opened by the shortcut, stay open.
      if (Date.now() - sidebarOpenedAt > 800) {
        window.close();
      }
      return;
    }
    if (message.type === 'summarize_url') {
      currentUrl = message.url;
      el.urlInput.value = message.url;
      updateUrlBarButtons();
      if (message.summary_type) {
        setActiveType(message.summary_type, false);
      }
      runSummarize(message.url);
    }
  });
}

// --- URL Bar Buttons ---
function updateUrlBarButtons() {
  const hasText = el.urlInput.value.trim().length > 0;
  el.clearUrlBtn.style.display = hasText ? '' : 'none';
}

// Show/hide the "Summarize current page" text link based on state
function updateCurrentPageAction() {
  // Show when a result or error is active — the user may have navigated
  // to a new page and wants to quickly summarize wherever they are now
  const resultVisible = el.stateResult.style.display !== 'none';
  const errorVisible = el.stateError.style.display !== 'none';
  el.useCurrentPage.style.display = (resultVisible || errorVisible) ? '' : 'none';
}

// --- URL Submit ---
function handleUrlSubmit() {
  const input = el.urlInput.value.trim();
  if (!input) {
    // No input — summarize current page
    summarizeCurrentPage();
    return;
  }

  // If the user typed something without a protocol, add https://
  let url = input;
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    new URL(url); // validate
    currentUrl = url;
    runSummarize(url);
  } catch (e) {
    el.errorMessage.textContent = 'Please enter a valid URL.';
    showState('error');
  }
}

// --- Quick Settings ---
async function loadQuickSettings() {
  try {
    const result = await api.storage.sync.get('summarizer_settings');
    const s = result?.summarizer_settings || {};
    el.quickEngine.value = s.engine || 'cecil';
    el.quickLanguage.value = s.target_language || '';
  } catch (e) {
    // defaults are fine
  }
}

function saveQuickSetting(key, value) {
  api.storage.sync.get('summarizer_settings').then((result) => {
    const settings = result?.summarizer_settings || {};
    settings[key] = value;
    api.storage.sync.set({ summarizer_settings: settings });
  });
}

// --- Type Toggle ---
function getActiveType() {
  return el.typeTakeaway.classList.contains('active') ? 'takeaway' : 'summary';
}

function setActiveType(type, shouldResummarize = true) {
  const wasDifferent = getActiveType() !== type;

  if (type === 'takeaway') {
    el.typeSummary.classList.remove('active');
    el.typeTakeaway.classList.add('active');
  } else {
    el.typeTakeaway.classList.remove('active');
    el.typeSummary.classList.add('active');
  }

  updateShortcutLabel();

  // Save preference
  api.storage.sync.get('summarizer_settings').then((result) => {
    const settings = result?.summarizer_settings || {};
    settings.summary_type = type;
    api.storage.sync.set({ summarizer_settings: settings });
  });

  // Re-summarize if the type changed and we have a URL
  if (shouldResummarize && wasDifferent && currentUrl && !isLoading) {
    runSummarize(currentUrl);
  }
}

async function loadSavedType() {
  try {
    const result = await api.storage.sync.get('summarizer_settings');
    const type = result?.summarizer_settings?.summary_type || 'summary';
    setActiveType(type, false);
  } catch (e) {
    // Default to summary
  }
}

// --- Summarize ---
async function summarizeCurrentPage() {
  try {
    const response = await api.runtime.sendMessage({ type: 'get_active_tab_url' });
    if (!response?.url || (!response.url.startsWith('http://') && !response.url.startsWith('https://'))) {
      showState('empty');
      return;
    }
    currentPageUrl = response.url;
    currentUrl = response.url;
    el.urlInput.value = response.url;
    updateUrlBarButtons();
    runSummarize(response.url);
  } catch (e) {
    showState('empty');
  }
}

async function runSummarize(url) {
  if (isLoading) return;
  isLoading = true;

  showState('loading');
  el.urlInput.value = url;
  updateUrlBarButtons();

  const summaryType = getActiveType();

  try {
    const result = await api.runtime.sendMessage({
      type: 'do_summarize',
      url: url,
      summary_type: summaryType,
    });

    if (result?.success) {
      renderSummary(result.summary, summaryType);
      showState('result');

      // Show time saved if available
      if (result.timeSavedInMinutes && result.timeSavedInMinutes > 0) {
        const minutes = Math.round(result.timeSavedInMinutes);
        el.timeSaved.textContent = `~${minutes} min saved`;
        el.timeSaved.style.display = '';
      } else {
        el.timeSaved.style.display = 'none';
      }

      // Save to history
      await addToHistory(url);
    } else {
      el.errorMessage.textContent = result?.summary || 'An unknown error occurred.';
      renderErrorActions(result?.errorType);
      showState('error');
    }
  } catch (e) {
    el.errorMessage.textContent = `Error: ${e.message || 'Failed to connect to background script.'}`;
    showState('error');
  } finally {
    isLoading = false;
  }
}

// --- Rendering ---
function renderSummary(text, summaryType) {
  const container = el.summaryContent;
  container.innerHTML = '';

  if (!text || !text.trim()) return;

  // Check if the API returned HTML — strip tags and render as clean text
  const hasHtml = /<\/?[a-z][\s\S]*?>/i.test(text);

  if (hasHtml) {
    // Parse HTML, extract text content safely
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    // Grab all meaningful block elements, or fall back to full body text
    const blocks = doc.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, div, blockquote');

    if (blocks.length > 0) {
      blocks.forEach((block) => {
        const txt = block.textContent.trim();
        if (!txt) return;

        const tagName = block.tagName.toLowerCase();

        if (tagName === 'li') {
          // Collect into a list — but for simplicity, render each as a bullet
          const li = document.createElement('div');
          li.className = 'summary-bullet';
          li.textContent = txt;
          container.appendChild(li);
        } else if (tagName.startsWith('h')) {
          const heading = document.createElement('h2');
          heading.textContent = txt;
          container.appendChild(heading);
        } else {
          const p = document.createElement('p');
          p.textContent = txt;
          container.appendChild(p);
        }
      });
    } else {
      // No block elements — just get the full text
      const plainText = doc.body.textContent.trim();
      renderPlainText(container, plainText, summaryType);
    }
  } else {
    renderPlainText(container, text, summaryType);
  }
}

function renderPlainText(container, text, summaryType) {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return;

  if (summaryType === 'takeaway') {
    // All lines as bullet list
    const ul = document.createElement('ul');
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, '');
      ul.appendChild(li);
    }
    container.appendChild(ul);
  } else {
    // Render as paragraphs — don't force first line as h2 since API content varies
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      container.appendChild(p);
    }
  }
}

// --- Error Actions ---
function renderErrorActions(errorType) {
  el.errorActions.innerHTML = '';

  if (errorType === 'auth_signin') {
    // Free API: user needs to sign in to kagi.com
    const signInLink = document.createElement('a');
    signInLink.href = 'https://kagi.com/signin';
    signInLink.target = '_blank';
    signInLink.rel = 'noopener';
    signInLink.className = 'error-action-link';
    signInLink.textContent = 'Sign in to kagi.com';
    el.errorActions.appendChild(signInLink);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'error-action-link';
    settingsBtn.textContent = 'Add API key in Settings';
    settingsBtn.addEventListener('click', () => api.runtime.openOptionsPage());
    el.errorActions.appendChild(settingsBtn);
  } else if (errorType === 'auth_token') {
    // Paid API: token is invalid
    const kagiLink = document.createElement('a');
    kagiLink.href = 'https://kagi.com/settings?p=api';
    kagiLink.target = '_blank';
    kagiLink.rel = 'noopener';
    kagiLink.className = 'error-action-link';
    kagiLink.textContent = 'Get API key from kagi.com';
    el.errorActions.appendChild(kagiLink);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'error-action-link';
    settingsBtn.textContent = 'Update API key in Settings';
    settingsBtn.addEventListener('click', () => api.runtime.openOptionsPage());
    el.errorActions.appendChild(settingsBtn);
  }
}

// --- History ---
const MAX_HISTORY = 10;

async function getHistory() {
  try {
    const result = await api.storage.local.get('summarizer_history');
    return result?.summarizer_history || [];
  } catch (e) {
    return [];
  }
}

async function addToHistory(url) {
  const history = await getHistory();
  // Remove duplicate if exists
  const filtered = history.filter((item) => item.url !== url);
  // Add to front
  filtered.unshift({ url, timestamp: Date.now() });
  // Trim to max
  const trimmed = filtered.slice(0, MAX_HISTORY);
  await api.storage.local.set({ summarizer_history: trimmed });
  await renderHistory();
}

async function removeFromHistory(url) {
  const history = await getHistory();
  const filtered = history.filter((item) => item.url !== url);
  await api.storage.local.set({ summarizer_history: filtered });
  await renderHistory();
}

async function renderHistory() {
  const history = await getHistory();

  if (history.length === 0) {
    el.historySection.style.display = 'none';
    return;
  }

  el.historySection.style.display = '';
  el.historyCount.textContent = history.length;
  el.historyList.innerHTML = '';

  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'history-row';

    const btn = document.createElement('button');
    btn.className = 'history-item';
    btn.title = item.url;
    btn.textContent = truncateUrl(item.url);
    btn.addEventListener('click', () => {
      currentUrl = item.url;
      el.urlInput.value = item.url;
      runSummarize(item.url);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'history-remove';
    removeBtn.title = 'Remove from recent';
    removeBtn.setAttribute('aria-label', `Remove ${truncateUrl(item.url)} from recent`);
    removeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromHistory(item.url);
    });

    row.appendChild(btn);
    row.appendChild(removeBtn);
    el.historyList.appendChild(row);
  }
}

// --- State Management ---
function showState(state) {
  el.stateEmpty.style.display = 'none';
  el.stateLoading.style.display = 'none';
  el.stateResult.style.display = 'none';
  el.stateError.style.display = 'none';
  el.footer.style.display = 'none';

  switch (state) {
    case 'empty':
      el.stateEmpty.style.display = '';
      break;
    case 'loading':
      el.stateLoading.style.display = '';
      break;
    case 'result':
      el.stateResult.style.display = '';
      el.footer.style.display = '';
      break;
    case 'error':
      el.stateError.style.display = '';
      el.footer.style.display = '';
      break;
  }

  updateCurrentPageAction();
}

// --- Copy ---
async function handleCopy() {
  const text = el.summaryContent.innerText;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    el.copyBtn.classList.add('copied');
    el.copyLabel.textContent = 'Copied!';

    setTimeout(() => {
      el.copyBtn.classList.remove('copied');
      el.copyLabel.textContent = 'Copy';
    }, 1500);
  } catch (e) {
    // Fallback: select text
    const range = document.createRange();
    range.selectNodeContents(el.summaryContent);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

// --- Helpers ---
function truncateUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname;
    const display = host + path;
    return display.length > 55 ? display.substring(0, 52) + '...' : display;
  } catch (e) {
    return url.length > 55 ? url.substring(0, 52) + '...' : url;
  }
}
