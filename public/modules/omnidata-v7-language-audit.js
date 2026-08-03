(function installV7LanguageAudit() {
  'use strict';

  const ROOT_SELECTORS = [
    '.sidebar',
    '.topbar',
    '.od-tabs',
    '.od-status-strip',
    '.od-commandbar',
    '.od-table thead',
    '.od-table-footer',
    '.od-inspector',
    '.notice',
    'dialog',
    '.form-shell',
  ];

  function normalizeTextNode(node) {
    const original = node.nodeValue;
    if (!original || !original.trim()) return;
    const translated = I18N.translate(original);
    if (translated !== original) node.nodeValue = translated;
  }

  function normalizeRoot(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      normalizeTextNode(node);
      node = walker.nextNode();
    }

    root.querySelectorAll('[title], [aria-label], input[placeholder], textarea[placeholder]').forEach((element) => {
      for (const attribute of ['title', 'aria-label', 'placeholder']) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        const translated = I18N.translate(value);
        if (translated !== value) element.setAttribute(attribute, translated);
      }
    });
  }

  function auditV7Language() {
    document.querySelectorAll(ROOT_SELECTORS.join(',')).forEach(normalizeRoot);
  }

  const previousRenderApp = renderApp;
  renderApp = (...args) => {
    const result = previousRenderApp(...args);
    auditV7Language();
    return result;
  };

  window.SynthaV7LanguageAudit = Object.freeze({ audit: auditV7Language });
})();
