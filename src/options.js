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

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('api-token');
  const tokenToggle = document.getElementById('token-toggle');
  const iconShow = document.getElementById('icon-show');
  const iconHide = document.getElementById('icon-hide');
  const engineRadios = document.querySelectorAll('input[name="engine"]');
  const languageSelect = document.getElementById('target-language');
  const saveIndicator = document.getElementById('save-indicator');
  let hideTimeout;
  let saveDebounce;

  // --- Platform-aware shortcuts ---
  function isMac() {
    if (navigator.userAgentData?.platform) {
      return navigator.userAgentData.platform === 'macOS';
    }
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  }

  function renderShortcutKeys(containerId, keys) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = keys.map((k) => `<kbd>${k}</kbd>`).join('');
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

    // Engine (migrate deprecated daphne → agnes)
    let engine = settings.engine || 'cecil';
    if (engine === 'daphne') {
      engine = 'agnes';
      saveSettings({ engine });
    }
    const radio = document.querySelector(`input[name="engine"][value="${engine}"]`);
    if (radio) radio.checked = true;

    // Language
    languageSelect.value = settings.target_language || '';

    // Theme color
    const savedColor = settings.theme_color || 'yellow';
    document.querySelectorAll('.color-swatch').forEach((s) => {
      s.classList.toggle('active', s.dataset.color === savedColor);
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

  // --- Theme color: save on click ---
  document.querySelectorAll('.color-swatch').forEach((swatch) => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
      swatch.classList.add('active');
      saveSettings({ theme_color: swatch.dataset.color });
    });
  });
});
