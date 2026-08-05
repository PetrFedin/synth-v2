var renderNavigation = function renderNavigationFallback() {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null;
  return document.querySelector('nav');
};

(function installTechPackNavigationBridge(global) {
  'use strict';

  const LABELS = new Set(['Технические пакеты', 'Tech packs', 'Tech Packs']);
  const MARKER = 'synthaTechPacksNavigation';

  function activate(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    for (const button of root.querySelectorAll('nav button, .sidebar button, button')) {
      if (!LABELS.has(String(button.textContent || '').trim())) continue;
      button.disabled = false;
      button.classList?.remove('planned', 'is-planned');
      button.setAttribute?.('aria-label', typeof localText === 'function' ? localText('Открыть технические пакеты', 'Open Tech Packs') : 'Open Tech Packs');
      if (button.dataset?.[MARKER] === 'true') continue;
      if (button.dataset) button.dataset[MARKER] = 'true';
      button.addEventListener?.('click', (event) => {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        if (typeof state !== 'undefined') state.view = 'tech-packs';
        if (typeof renderApp === 'function') renderApp();
      }, true);
    }
  }

  global.SynthaTechPackNavigation = Object.freeze({ activate });
  if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.documentElement) {
    const observer = new MutationObserver(() => activate(document));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (typeof queueMicrotask === 'function') queueMicrotask(() => activate(typeof document === 'undefined' ? null : document));
})(window);
