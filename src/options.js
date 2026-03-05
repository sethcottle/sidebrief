// Cross-browser namespace
const api = typeof browser !== 'undefined' ? browser : chrome;

// --- Theme color definitions (must match sidebar.js) ---
const themeColors = {
  yellow:   { light: '#C58A00', dark: '#ffb319' },
  orange:   { light: '#D4580A', dark: '#FB923C' },
  purple:   { light: '#7C3AED', dark: '#A78BFA' },
  sky:      { light: '#0878B0', dark: '#38BDF8' },
  grass:    { light: '#178A42', dark: '#4ADE80' },
  graphite: { light: '#4B5563', dark: '#9CA3AF' },
};

// --- Font settings (must match sidebar.js) ---
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 24;
const FONT_SIZE_STEP = 1;
const FONT_SIZE_DEFAULT = 14;

function normalizeFontSize(value) {
  if (typeof value === 'number') return Math.min(Math.max(value, FONT_SIZE_MIN), FONT_SIZE_MAX);
  const legacy = { small: 13, medium: 14, large: 16 };
  return legacy[value] || FONT_SIZE_DEFAULT;
}

const fontFamilyMap = {
  system:    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif:     'Georgia, "Noto Serif", "Times New Roman", serif',
  monospace: '"SF Mono", "Cascadia Code", "Fira Code", Consolas, "Liberation Mono", monospace',
  dyslexic:  '"OpenDyslexic", sans-serif',
};

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('api-token');
  const tokenToggle = document.getElementById('token-toggle');
  const iconShow = document.getElementById('icon-show');
  const iconHide = document.getElementById('icon-hide');
  const engineRadios = document.querySelectorAll('input[name="engine"]');
  const languageSelect = document.getElementById('target-language');
  const saveIndicator = document.getElementById('save-indicator');
  const fontSizeOptions = document.getElementById('font-size-options');
  const fontDecrease = document.getElementById('opt-font-decrease');
  const fontIncrease = document.getElementById('opt-font-increase');
  const fontSizeDisplay = document.getElementById('opt-font-value');
  const fontFamilySelect = document.getElementById('font-family-select');
  const fontPreviewText = document.querySelector('.font-preview-text');
  let currentFontSize = FONT_SIZE_DEFAULT;
  let hideTimeout;
  let saveDebounce;

  function updateFontPreview(fontSize, fontFamily) {
    const size = normalizeFontSize(fontSize);
    const family = fontFamilyMap[fontFamily] || fontFamilyMap.system;
    fontPreviewText.style.fontSize = `${size}px`;
    fontPreviewText.style.fontFamily = family;
  }

  function updateFontSizeUI() {
    fontSizeDisplay.textContent = `${currentFontSize}px`;
    fontDecrease.disabled = currentFontSize <= FONT_SIZE_MIN;
    fontIncrease.disabled = currentFontSize >= FONT_SIZE_MAX;
  }

  // --- Platform aware shortcuts ---
  function isMac() {
    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform === 'macOS';
    }
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  }

  function renderShortcutKeys(containerId, keys) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.textContent = '';
    keys.forEach((k) => {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      container.appendChild(kbd);
    });
  }

  const mac = isMac();
  renderShortcutKeys('shortcut-open', mac ? ['⌥', 'Shift', 'B'] : ['Alt', 'Shift', 'B']);
  renderShortcutKeys('shortcut-summarize', mac ? ['⌥', 'Shift', 'S'] : ['Alt', 'Shift', 'S']);
  renderShortcutKeys('shortcut-moments', mac ? ['⌥', 'Shift', 'K'] : ['Alt', 'Shift', 'K']);

  // --- Swatch colors: adapt to light/dark ---
  function updateSwatchColors() {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.querySelectorAll('.color-swatch').forEach((swatch) => {
      const color = themeColors[swatch.dataset.color];
      if (color) {
        swatch.style.backgroundColor = isDark ? color.dark : color.light;
      }
    });
  }

  updateSwatchColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateSwatchColors);

  // --- Toast ---
  function showSaved() {
    clearTimeout(hideTimeout);
    saveIndicator.classList.remove('hiding');
    saveIndicator.classList.add('visible');

    hideTimeout = setTimeout(() => {
      saveIndicator.classList.remove('visible');
      saveIndicator.classList.add('hiding');
      setTimeout(() => saveIndicator.classList.remove('hiding'), 300);
    }, 1500);
  }

  // --- Load settings ---
  api.storage.sync.get('summarizer_settings').then((result) => {
    const settings = result?.summarizer_settings || {};

    // API token
    tokenInput.value = settings.api_token || '';

    // Engine (migrate deprecated daphne > agnes)
    let engine = settings.engine || 'cecil';
    if (engine === 'daphne') {
      engine = 'agnes';
      saveSettings({ engine });
    }
    const radio = document.querySelector(`input[name="engine"][value="${engine}"]`);
    if (radio) radio.checked = true;

    // Language
    languageSelect.value = settings.target_language || '';

    // Font settings
    currentFontSize = normalizeFontSize(settings.font_size ?? FONT_SIZE_DEFAULT);
    updateFontSizeUI();
    fontFamilySelect.value = settings.font_family || 'system';
    updateFontPreview(currentFontSize, settings.font_family || 'system');

    // Theme color
    const savedColor = settings.theme_color || 'yellow';
    document.querySelectorAll('.color-swatch').forEach((s) => {
      const isActive = s.dataset.color === savedColor;
      s.classList.toggle('active', isActive);
      s.setAttribute('aria-pressed', String(isActive));
    });
  });

  // --- Save helpers ---
  function saveSettings(partial) {
    api.storage.sync.get('summarizer_settings').then((result) => {
      const settings = result?.summarizer_settings || {};
      Object.assign(settings, partial);
      api.storage.sync.set({ summarizer_settings: settings }).then(showSaved);
    });
  }

  // --- Token: save on input with debounce ---
  tokenInput.addEventListener('input', () => {
    clearTimeout(saveDebounce);
    saveDebounce = setTimeout(() => {
      saveSettings({ api_token: tokenInput.value.trim() });
    }, 600);
  });

  // --- Token visibility toggle ---
  tokenToggle.addEventListener('click', () => {
    const isPassword = tokenInput.type === 'password';
    tokenInput.type = isPassword ? 'text' : 'password';
    iconShow.style.display = isPassword ? 'none' : '';
    iconHide.style.display = isPassword ? '' : 'none';
    tokenToggle.setAttribute('aria-label', isPassword ? 'Hide token' : 'Show token');
    tokenToggle.setAttribute('aria-pressed', String(isPassword));
  });

  // --- Engine: save on change ---
  engineRadios.forEach((radio) => {
    radio.addEventListener('change', (e) => {
      saveSettings({ engine: e.target.value });
    });
  });

  // --- Language: save on change ---
  languageSelect.addEventListener('change', () => {
    saveSettings({ target_language: languageSelect.value });
  });

  // --- Font size: A-/A+ buttons ---
  function adjustFontSize(delta) {
    const newSize = Math.min(Math.max(currentFontSize + delta, FONT_SIZE_MIN), FONT_SIZE_MAX);
    if (newSize === currentFontSize) return;
    currentFontSize = newSize;
    updateFontSizeUI();
    saveSettings({ font_size: currentFontSize });
    updateFontPreview(currentFontSize, fontFamilySelect.value);
  }

  fontDecrease.addEventListener('click', () => adjustFontSize(-FONT_SIZE_STEP));
  fontIncrease.addEventListener('click', () => adjustFontSize(FONT_SIZE_STEP));

  // --- Font family: save on change ---
  fontFamilySelect.addEventListener('change', () => {
    saveSettings({ font_family: fontFamilySelect.value });
    updateFontPreview(currentFontSize, fontFamilySelect.value);
  });

  // --- Theme color: save on click ---
  document.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach((s) => {
        s.classList.remove('active');
        s.setAttribute('aria-pressed', 'false');
      });
      swatch.classList.add('active');
      swatch.setAttribute('aria-pressed', 'true');
      saveSettings({ theme_color: swatch.dataset.color });
    });
  });
});
